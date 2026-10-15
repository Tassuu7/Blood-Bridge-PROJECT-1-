/**
 * BloodBridge Hospital Staff Delegation Controller
 */

import { Request, Response } from 'express';
import {
  addHospitalStaff,
  getHospitalStaff,
  deactivateStaff,
  getPermissionsForRole,
  HospitalStaffRole,
} from '../services/hospitalStaffService';

export function getStaffHandler(req: Request, res: Response): void {
  try {
    const hospitalId =
      req.user?.hospitalProfileId ||
      (req as any).user?.hospitalProfile?.id ||
      (req.query.hospitalId as string);
    if (!hospitalId) {
      res.status(400).json({ success: false, error: 'Hospital identifier is required' });
      return;
    }

    const staff = getHospitalStaff(hospitalId);
    res.json({
      success: true,
      data: staff,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export function addStaffHandler(req: Request, res: Response): void {
  try {
    const hospitalId =
      req.user?.hospitalProfileId ||
      (req as any).user?.hospitalProfile?.id ||
      req.body.hospitalId;
    const { fullName, email, role, licenseNumber, department } = req.body;

    if (!hospitalId || !fullName || !email || !role || !department) {
      res.status(400).json({
        success: false,
        error: 'Missing required staff fields (hospitalId, fullName, email, role, department)',
      });
      return;
    }

    const newStaff = addHospitalStaff({
      hospitalId,
      fullName,
      email,
      role: role as HospitalStaffRole,
      licenseNumber,
      department,
    });

    const permissions = getPermissionsForRole(role as HospitalStaffRole);

    res.status(201).json({
      success: true,
      data: {
        ...newStaff,
        permissions,
      },
      message: 'Staff member registered successfully',
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export function deleteStaffHandler(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const ok = deactivateStaff(id);

    if (!ok) {
      res.status(404).json({ success: false, error: 'Staff member not found' });
      return;
    }

    res.json({ success: true, message: 'Staff member deactivated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
