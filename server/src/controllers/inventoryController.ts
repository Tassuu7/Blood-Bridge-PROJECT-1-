/**
 * BloodBridge Hospital Blood Inventory Controller
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

export function getInventoryHandler(req: Request, res: Response): void {
  try {
    const hospitalId =
      req.user?.hospitalProfileId ||
      (req as any).user?.hospitalProfile?.id ||
      (req.query.hospitalId as string);
    if (!hospitalId) {
      res.status(400).json({ success: false, error: 'Hospital identifier is required' });
      return;
    }

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

export function restockInventoryHandler(req: Request, res: Response): void {
  try {
    const hospitalId =
      req.user?.hospitalProfileId ||
      (req as any).user?.hospitalProfile?.id ||
      req.body.hospitalId;
    const { bloodGroup, units, collectedAt, shelfLifeDays } = req.body;

    if (!hospitalId || !bloodGroup || !units) {
      res.status(400).json({ success: false, error: 'Hospital, blood group, and units are required' });
      return;
    }

    const result = restockBloodBatch({
      hospitalId,
      bloodGroup: bloodGroup as BloodGroup,
      units: Number(units),
      collectedAt,
      shelfLifeDays: shelfLifeDays ? Number(shelfLifeDays) : undefined,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export function reserveInventoryHandler(req: Request, res: Response): void {
  try {
    const hospitalId =
      req.user?.hospitalProfileId ||
      (req as any).user?.hospitalProfile?.id ||
      req.body.hospitalId;
    const { bloodGroup, units } = req.body;

    if (!hospitalId || !bloodGroup || !units) {
      res.status(400).json({ success: false, error: 'Hospital, blood group, and units are required' });
      return;
    }

    const result = reserveUnits(hospitalId, bloodGroup as BloodGroup, Number(units));
    if (!result.success) {
      res.status(409).json({
        success: false,
        error: 'Insufficient available units to fulfill reservation',
        data: result,
      });
      return;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export function dispenseInventoryHandler(req: Request, res: Response): void {
  try {
    const hospitalId =
      req.user?.hospitalProfileId ||
      (req as any).user?.hospitalProfile?.id ||
      req.body.hospitalId;
    const { bloodGroup, units } = req.body;

    if (!hospitalId || !bloodGroup || !units) {
      res.status(400).json({ success: false, error: 'Missing required parameters' });
      return;
    }

    const ok = dispenseUnits(hospitalId, bloodGroup as BloodGroup, Number(units));
    if (!ok) {
      res.status(400).json({ success: false, error: 'Cannot dispense more than reserved units' });
      return;
    }

    res.json({ success: true, message: 'Units successfully dispensed for transfusion' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
