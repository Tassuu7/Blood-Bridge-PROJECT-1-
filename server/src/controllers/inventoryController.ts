/**
 * BloodBridge Hospital Blood Inventory Controller
 * Hardened with tenant isolation guards, strict payload sanitization,
 * non-negative / bounded unit validation, chained audit logging,
 * and real-time socket synchronization.
 */

import { Request, Response } from 'express';
import {
  getHospitalInventory,
  restockBloodBatch,
  reserveUnits,
  releaseReservedUnits,
  dispenseUnits,
  getLowInventoryAlerts,
} from '../services/inventoryService';
import { BloodGroup } from '../../../shared/types';
import { logAudit } from '../services/auditService';
import { emitToHospital, emitToRole } from '../realtime/socketHandler';
import { SOCKET_EVENTS } from '../realtime/events';

const VALID_BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface HospitalResolutionResult {
  hospitalId?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Scopes the request to an authorized hospital tenant.
 * Prevents cross-tenant spoofing by strictly binding HOSPITAL users
 * to their verified hospital profile.
 */
function resolveHospitalId(req: Request): HospitalResolutionResult {
  const user = req.user;
  if (!user) {
    return { error: 'Authentication required', statusCode: 401 };
  }

  if (user.role === 'HOSPITAL') {
    const hospitalId = user.hospitalProfileId;
    if (!hospitalId) {
      return {
        error: 'Authenticated hospital user does not have an active hospital profile',
        statusCode: 403,
      };
    }
    return { hospitalId };
  }

  if (user.role === 'ADMIN') {
    const targetHospitalId =
      (req.query.hospitalId as string) || req.body?.hospitalId || user.hospitalProfileId || user.id;
    if (!targetHospitalId) {
      return {
        error: 'Hospital identifier is required for administrator inventory management',
        statusCode: 400,
      };
    }
    return { hospitalId: targetHospitalId };
  }

  return {
    error: 'Forbidden. Only hospital staff and platform administrators can manage inventory.',
    statusCode: 403,
  };
}

function validateBloodGroup(bloodGroup: any): { valid: boolean; error?: string } {
  if (!bloodGroup || !VALID_BLOOD_GROUPS.includes(bloodGroup as BloodGroup)) {
    return {
      valid: false,
      error: `Invalid blood group '${bloodGroup}'. Must be one of: ${VALID_BLOOD_GROUPS.join(', ')}`,
    };
  }
  return { valid: true };
}

function validateUnits(
  units: any,
  maxLimit: number = 100
): { valid: boolean; value: number; error?: string } {
  const num = Number(units);
  if (!Number.isInteger(num) || num <= 0) {
    return {
      valid: false,
      value: 0,
      error: 'Units must be a positive whole integer greater than zero',
    };
  }
  if (num > maxLimit) {
    return {
      valid: false,
      value: 0,
      error: `Units cannot exceed maximum allowed limit of ${maxLimit} units`,
    };
  }
  return { valid: true, value: num };
}

export function getInventoryHandler(req: Request, res: Response): void {
  try {
    const resolution = resolveHospitalId(req);
    if (!resolution.hospitalId) {
      res.status(resolution.statusCode || 400).json({
        success: false,
        error: resolution.error,
      });
      return;
    }

    const hospitalId = resolution.hospitalId;
    const inventory = getHospitalInventory(hospitalId);
    const lowStockAlerts = getLowInventoryAlerts(hospitalId);

    res.json({
      success: true,
      data: {
        inventory,
        lowStockAlerts,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function restockInventoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const resolution = resolveHospitalId(req);
    if (!resolution.hospitalId) {
      res.status(resolution.statusCode || 400).json({
        success: false,
        error: resolution.error,
      });
      return;
    }

    const hospitalId = resolution.hospitalId;
    const { bloodGroup, units, collectedAt, shelfLifeDays } = req.body;

    const bgValidation = validateBloodGroup(bloodGroup);
    if (!bgValidation.valid) {
      res.status(400).json({ success: false, error: bgValidation.error });
      return;
    }

    // Allow restocking up to 500 units in a single batch
    const unitsValidation = validateUnits(units, 500);
    if (!unitsValidation.valid) {
      res.status(400).json({ success: false, error: unitsValidation.error });
      return;
    }

    if (shelfLifeDays !== undefined) {
      const days = Number(shelfLifeDays);
      if (!Number.isInteger(days) || days < 1 || days > 60) {
        res.status(400).json({
          success: false,
          error: 'Shelf life days must be an integer between 1 and 60 days',
        });
        return;
      }
    }

    const result = restockBloodBatch({
      hospitalId,
      bloodGroup: bloodGroup as BloodGroup,
      units: unitsValidation.value,
      collectedAt,
      shelfLifeDays: shelfLifeDays ? Number(shelfLifeDays) : undefined,
    });

    // Chained audit ledger
    await logAudit({
      userId: req.user?.id,
      action: 'HOSPITAL_INVENTORY_RESTOCKED',
      entityType: 'HospitalInventory',
      entityId: hospitalId,
      details: {
        bloodGroup,
        units: unitsValidation.value,
        batchNumber: result.batch.batchNumber,
        expiresAt: result.batch.expiresAt,
        newTotal: result.newTotal,
      },
      ipAddress: req.ip,
    });

    // Real-time update emission
    const payload = {
      hospitalId,
      action: 'RESTOCKED',
      bloodGroup,
      units: unitsValidation.value,
      newTotal: result.newTotal,
      timestamp: new Date().toISOString(),
    };
    emitToHospital(hospitalId, SOCKET_EVENTS.INVENTORY_UPDATED, payload);
    emitToRole('HOSPITAL', SOCKET_EVENTS.INVENTORY_UPDATED, payload);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export async function reserveInventoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const resolution = resolveHospitalId(req);
    if (!resolution.hospitalId) {
      res.status(resolution.statusCode || 400).json({
        success: false,
        error: resolution.error,
      });
      return;
    }

    const hospitalId = resolution.hospitalId;
    const { bloodGroup, units } = req.body;

    const bgValidation = validateBloodGroup(bloodGroup);
    if (!bgValidation.valid) {
      res.status(400).json({ success: false, error: bgValidation.error });
      return;
    }

    const unitsValidation = validateUnits(units, 100);
    if (!unitsValidation.valid) {
      res.status(400).json({ success: false, error: unitsValidation.error });
      return;
    }

    const result = reserveUnits(hospitalId, bloodGroup as BloodGroup, unitsValidation.value);
    if (!result.success) {
      res.status(409).json({
        success: false,
        error: 'Insufficient available units to fulfill reservation',
        data: result,
      });
      return;
    }

    // Chained audit ledger
    await logAudit({
      userId: req.user?.id,
      action: 'HOSPITAL_INVENTORY_RESERVED',
      entityType: 'HospitalInventory',
      entityId: hospitalId,
      details: {
        bloodGroup,
        unitsReserved: result.unitsReserved,
        remainingAvailable: result.remainingAvailable,
      },
      ipAddress: req.ip,
    });

    // Real-time update emission
    const payload = {
      hospitalId,
      action: 'RESERVED',
      bloodGroup,
      units: unitsValidation.value,
      remainingAvailable: result.remainingAvailable,
      timestamp: new Date().toISOString(),
    };
    emitToHospital(hospitalId, SOCKET_EVENTS.INVENTORY_UPDATED, payload);
    emitToRole('HOSPITAL', SOCKET_EVENTS.INVENTORY_UPDATED, payload);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function releaseInventoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const resolution = resolveHospitalId(req);
    if (!resolution.hospitalId) {
      res.status(resolution.statusCode || 400).json({
        success: false,
        error: resolution.error,
      });
      return;
    }

    const hospitalId = resolution.hospitalId;
    const { bloodGroup, units } = req.body;

    const bgValidation = validateBloodGroup(bloodGroup);
    if (!bgValidation.valid) {
      res.status(400).json({ success: false, error: bgValidation.error });
      return;
    }

    const unitsValidation = validateUnits(units, 100);
    if (!unitsValidation.valid) {
      res.status(400).json({ success: false, error: unitsValidation.error });
      return;
    }

    releaseReservedUnits(hospitalId, bloodGroup as BloodGroup, unitsValidation.value);

    // Chained audit ledger
    await logAudit({
      userId: req.user?.id,
      action: 'HOSPITAL_INVENTORY_RELEASED',
      entityType: 'HospitalInventory',
      entityId: hospitalId,
      details: {
        bloodGroup,
        unitsReleased: unitsValidation.value,
      },
      ipAddress: req.ip,
    });

    // Real-time update emission
    const payload = {
      hospitalId,
      action: 'RELEASED',
      bloodGroup,
      units: unitsValidation.value,
      timestamp: new Date().toISOString(),
    };
    emitToHospital(hospitalId, SOCKET_EVENTS.INVENTORY_UPDATED, payload);
    emitToRole('HOSPITAL', SOCKET_EVENTS.INVENTORY_UPDATED, payload);

    res.json({
      success: true,
      message: 'Units successfully returned to available inventory',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function dispenseInventoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const resolution = resolveHospitalId(req);
    if (!resolution.hospitalId) {
      res.status(resolution.statusCode || 400).json({
        success: false,
        error: resolution.error,
      });
      return;
    }

    const hospitalId = resolution.hospitalId;
    const { bloodGroup, units } = req.body;

    const bgValidation = validateBloodGroup(bloodGroup);
    if (!bgValidation.valid) {
      res.status(400).json({ success: false, error: bgValidation.error });
      return;
    }

    const unitsValidation = validateUnits(units, 100);
    if (!unitsValidation.valid) {
      res.status(400).json({ success: false, error: unitsValidation.error });
      return;
    }

    const ok = dispenseUnits(hospitalId, bloodGroup as BloodGroup, unitsValidation.value);
    if (!ok) {
      res.status(400).json({
        success: false,
        error: 'Cannot dispense more than reserved units',
      });
      return;
    }

    // Chained audit ledger
    await logAudit({
      userId: req.user?.id,
      action: 'HOSPITAL_INVENTORY_DISPENSED',
      entityType: 'HospitalInventory',
      entityId: hospitalId,
      details: {
        bloodGroup,
        unitsDispensed: unitsValidation.value,
      },
      ipAddress: req.ip,
    });

    // Real-time update emission
    const payload = {
      hospitalId,
      action: 'DISPENSED',
      bloodGroup,
      units: unitsValidation.value,
      timestamp: new Date().toISOString(),
    };
    emitToHospital(hospitalId, SOCKET_EVENTS.INVENTORY_UPDATED, payload);
    emitToRole('HOSPITAL', SOCKET_EVENTS.INVENTORY_UPDATED, payload);

    res.json({
      success: true,
      message: 'Units successfully dispensed for transfusion',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
