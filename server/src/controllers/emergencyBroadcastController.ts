/**
 * BloodBridge Emergency Regional Broadcast Controller
 */

import { Request, Response } from 'express';
import {
  issueEmergencyBroadcast,
  getActiveBroadcasts,
  revokeEmergencyBroadcast,
  BroadcastLevel,
} from '../services/emergencyBroadcastService';
import { broadcastGlobal } from '../realtime/socketHandler';
import { SOCKET_EVENTS } from '../realtime/events';
import { logAudit } from '../services/auditService';

const VALID_LEVELS: BroadcastLevel[] = [
  'LEVEL_1_FACILITY_URGENT',
  'LEVEL_2_METRO_ALERT',
  'LEVEL_3_REGIONAL_DISASTER',
  'LEVEL_4_NATIONAL_RESERVE',
];

export function getActiveBroadcastsHandler(_req: Request, res: Response): void {
  try {
    const broadcasts = getActiveBroadcasts();
    res.json({
      success: true,
      data: broadcasts,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function issueBroadcastHandler(req: Request, res: Response): Promise<void> {
  try {
    const authorAdminId = req.user?.id;
    const { level, title, incidentDescription, affectedRegion, targetBloodGroups, durationHours } = req.body;

    if (!authorAdminId || !level || !title || !incidentDescription || !affectedRegion) {
      res.status(400).json({
        success: false,
        error: 'Missing required broadcast fields (level, title, incidentDescription, affectedRegion)',
      });
      return;
    }

    if (!VALID_LEVELS.includes(level as BroadcastLevel)) {
      res.status(400).json({
        success: false,
        error: `Invalid emergency broadcast level '${level}'. Valid levels: ${VALID_LEVELS.join(', ')}`,
      });
      return;
    }

    if (durationHours !== undefined) {
      const hoursNum = Number(durationHours);
      if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 168) {
        res.status(400).json({
          success: false,
          error: 'Duration hours must be a number between 1 and 168 (7 days).',
        });
        return;
      }
    }

    const broadcast = issueEmergencyBroadcast({
      level: level as BroadcastLevel,
      title: String(title).trim(),
      incidentDescription: String(incidentDescription).trim(),
      affectedRegion: String(affectedRegion).trim(),
      targetBloodGroups: Array.isArray(targetBloodGroups) ? targetBloodGroups : [],
      authorAdminId,
      durationHours: durationHours ? Number(durationHours) : undefined,
    });

    // Real-time broadcast push to all active platform clients
    broadcastGlobal(SOCKET_EVENTS.EMERGENCY_BROADCAST, broadcast);

    await logAudit({
      userId: authorAdminId,
      action: 'EMERGENCY_BROADCAST_DISPATCHED',
      entityType: 'EmergencyBroadcast',
      entityId: broadcast.id,
      details: {
        level: broadcast.level,
        title: broadcast.title,
        affectedRegion: broadcast.affectedRegion,
        targetBloodGroups: broadcast.targetBloodGroups,
        expiresAt: broadcast.expiresAt,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: broadcast,
      message: 'Regional emergency broadcast dispatched successfully',
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export async function revokeBroadcastHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const ok = revokeEmergencyBroadcast(id);

    if (!ok) {
      res.status(404).json({ success: false, error: 'Broadcast not found' });
      return;
    }

    // Real-time revocation push to all platform clients
    broadcastGlobal(SOCKET_EVENTS.EMERGENCY_BROADCAST_REVOKED, { id, revoked: true });

    await logAudit({
      userId: req.user?.id,
      action: 'EMERGENCY_BROADCAST_REVOKED',
      entityType: 'EmergencyBroadcast',
      entityId: id,
      details: { revokedBy: req.user?.fullName },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Broadcast alert revoked successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
