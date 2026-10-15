import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { detectDuplicateRequest } from '../services/duplicateDetectionService';
import { createNotification } from '../services/notificationService';
import { logAudit } from '../services/auditService';
import { escalateRequest } from '../services/escalationService';
import {
  cancelBloodRequest,
  isRequestCancellable,
  generateStandDownMessage,
  CancellationReason,
} from '../services/cancellationService';
import { emitToRole, emitToRequest, broadcastGlobal } from '../realtime/socketHandler';
import { SOCKET_EVENTS } from '../realtime/events';
import { BloodGroup, UrgencyLevel } from '../../../shared/types';

const createRequestSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital is required'),
  patientInitials: z.string().min(1, 'Patient initials required for coordination tracking'),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  unitsRequired: z.number().int().min(1).max(20),
  urgency: z.enum(['NORMAL', 'URGENT', 'CRITICAL']),
  requiredBy: z.string().refine((val) => !isNaN(new Date(val).getTime()), {
    message: 'requiredBy must be a valid date string',
  }),
  notes: z.string().optional(),
});

/**
 * Generate formatted unique emergency request ID: BB-2026-XXXXXX
 */
async function generateRequestId(): Promise<string> {
  const count = await prisma.bloodRequest.count();
  const sequence = (count + 1).toString().padStart(6, '0');
  return `BB-2026-${sequence}`;
}

export async function createBloodRequest(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const validated = createRequestSchema.parse(req.body);
    const requiredByDate = new Date(validated.requiredBy);

    // Verify hospital exists
    const hospital = await prisma.hospitalProfile.findUnique({
      where: { id: validated.hospitalId },
      include: { user: true },
    });

    if (!hospital) {
      return res.status(400).json({ success: false, message: 'Specified hospital was not found.' });
    }

    // Run duplicate detection check
    const duplicateCheck = await detectDuplicateRequest({
      hospitalId: hospital.id,
      bloodGroup: validated.bloodGroup as BloodGroup,
      unitsRequired: validated.unitsRequired,
      requiredBy: requiredByDate,
    });

    const requestId = await generateRequestId();

    const newRequest = await prisma.bloodRequest.create({
      data: {
        id: requestId,
        requesterId: req.user.id,
        hospitalId: hospital.id,
        patientInitials: validated.patientInitials.toUpperCase().trim(),
        bloodGroup: validated.bloodGroup,
        unitsRequired: validated.unitsRequired,
        urgency: validated.urgency,
        status: 'PENDING_VERIFICATION',
        requiredBy: requiredByDate,
        notes: validated.notes || null,
        latitude: hospital.latitude,
        longitude: hospital.longitude,
        isDuplicateFlagged: duplicateCheck.isDuplicate,
        duplicateSimilarityScore: duplicateCheck.similarityScore,
        currentEscalationStage: 1,
      },
      include: {
        hospital: true,
        requester: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    // Create status history log
    await prisma.requestStatusHistory.create({
      data: {
        requestId: newRequest.id,
        fromStatus: 'INITIAL_DRAFT',
        toStatus: 'PENDING_VERIFICATION',
        changedByUserId: req.user.id,
        reason: duplicateCheck.isDuplicate
          ? `Request created with Duplicate Warning (${duplicateCheck.similarityScore}% match). Awaiting hospital review.`
          : 'Emergency request submitted and queued for hospital verification.',
      },
    });

    // Send notification to hospital
    await createNotification({
      userId: hospital.userId,
      category: 'EMERGENCY_REQUEST',
      title: `🏥 New Emergency Request for Verification: ${newRequest.id}`,
      message: `${newRequest.bloodGroup} (${newRequest.unitsRequired} units) requested for Patient ${newRequest.patientInitials}. Please verify.`,
      linkUrl: `/hospital/dashboard?request=${newRequest.id}`,
    });

    // Send confirmation notification to requester
    await createNotification({
      userId: req.user.id,
      category: 'SYSTEM',
      title: `Emergency Request Created (${newRequest.id})`,
      message: `Your request has been routed to ${hospital.hospitalName} for rapid verification.`,
      linkUrl: `/requester/dashboard?request=${newRequest.id}`,
    });

    // Real-time broadcast to hospital and admin
    emitToRole('HOSPITAL', SOCKET_EVENTS.REQUEST_CREATED, newRequest);
    emitToRole('ADMIN', SOCKET_EVENTS.REQUEST_CREATED, newRequest);

    await logAudit({
      userId: req.user.id,
      action: 'REQUEST_CREATED',
      entityType: 'BloodRequest',
      entityId: newRequest.id,
      details: {
        bloodGroup: newRequest.bloodGroup,
        units: newRequest.unitsRequired,
        urgency: newRequest.urgency,
        isDuplicateFlagged: duplicateCheck.isDuplicate,
      },
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: duplicateCheck.isDuplicate
        ? 'Emergency request submitted. Note: A potential similar active request was detected and flagged for hospital triage.'
        : 'Emergency request submitted successfully and queued for hospital verification.',
      request: newRequest,
      duplicateWarning: duplicateCheck.isDuplicate
        ? {
            similarityScore: duplicateCheck.similarityScore,
            matchedRequestId: duplicateCheck.matchedRequestId,
            reasons: duplicateCheck.reasons,
          }
        : null,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: error.errors[0]?.message || 'Validation error' });
    }
    console.error('createBloodRequest error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create emergency request.' });
  }
}

export async function getBloodRequests(req: Request, res: Response) {
  try {
    const {
      status,
      bloodGroup,
      urgency,
      hospitalId,
      requesterId,
      isDuplicateFlagged,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = {};

    if (status) whereClause.status = status;
    if (bloodGroup) whereClause.bloodGroup = bloodGroup;
    if (urgency) whereClause.urgency = urgency;
    if (hospitalId) whereClause.hospitalId = hospitalId;
    if (requesterId) whereClause.requesterId = requesterId;
    if (isDuplicateFlagged !== undefined) {
      whereClause.isDuplicateFlagged = isDuplicateFlagged === 'true';
    }

    // Role scoping: If requester, show only their requests unless admin
    if (req.user && req.user.role === 'REQUESTER' && !req.query.all) {
      whereClause.requesterId = req.user.id;
    }

    const [total, requests] = await Promise.all([
      prisma.bloodRequest.count({ where: whereClause }),
      prisma.bloodRequest.findMany({
        where: whereClause,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          hospital: true,
          requester: {
            select: {
              id: true,
              fullName: true,
              phone: true,
            },
          },
          matches: {
            include: {
              donor: {
                include: {
                  user: { select: { fullName: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      requests,
    });
  } catch (error) {
    console.error('getBloodRequests error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch blood requests.' });
  }
}

export async function getBloodRequestById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const request = await prisma.bloodRequest.findUnique({
      where: { id },
      include: {
        hospital: true,
        requester: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        matches: {
          include: {
            donor: {
              include: {
                user: { select: { fullName: true } },
              },
            },
          },
          orderBy: { matchScore: 'desc' },
        },
        verificationRecords: {
          include: {
            verifiedByUser: { select: { fullName: true } },
          },
          orderBy: { verifiedAt: 'desc' },
        },
        statusHistory: {
          include: {
            changedByUser: { select: { fullName: true, role: true } },
          },
          orderBy: { timestamp: 'asc' },
        },
        escalationEvents: {
          orderBy: { triggeredAt: 'asc' },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    return res.json({ success: true, request });
  } catch (error) {
    console.error('getBloodRequestById error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch request details.' });
  }
}

export async function markBloodReceived(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const request = await prisma.bloodRequest.findUnique({
      where: { id },
      include: {
        hospital: true,
        matches: {
          where: { status: 'ACCEPTED' },
          include: { donor: true },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    if (request.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'This request is already completed.' });
    }

    if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
      return res.status(400).json({
        success: false,
        message: `Cannot complete a ${request.status.toLowerCase()} blood request.`,
      });
    }

    // Update donor donation stats
    for (const match of request.matches) {
      await prisma.donorProfile.update({
        where: { id: match.donorId },
        data: {
          totalDonations: { increment: 1 },
          lastDonationDate: new Date(),
          availabilityStatus: 'NOT_AVAILABLE', // Cooldown period
        },
      });

      await createNotification({
        userId: match.donor.userId,
        category: 'BLOOD_RECEIVED',
        title: '❤️ Blood Donation Received & Confirmed',
        message: `Your donation for request ${request.id} has been confirmed received at ${request.hospital.hospitalName}. Thank you for saving lives!`,
        linkUrl: `/donor/dashboard`,
      });
    }

    // Update status to BLOOD_RECEIVED -> COMPLETED
    const updatedRequest = await prisma.bloodRequest.update({
      where: { id },
      data: {
        status: 'COMPLETED',
      },
    });

    await prisma.requestStatusHistory.create({
      data: {
        requestId: id,
        fromStatus: request.status,
        toStatus: 'COMPLETED',
        changedByUserId: req.user.id,
        reason: notes || 'Blood units safely received at hospital. Coordination lifecycle completed.',
      },
    });

    // Notify requester
    await createNotification({
      userId: request.requesterId,
      category: 'BLOOD_RECEIVED',
      title: '🎉 Emergency Request Completed',
      message: `The blood units for request ${request.id} have been confirmed received. Request successfully closed.`,
      linkUrl: `/requester/dashboard?request=${request.id}`,
    });

    // Real-time broadcasts
    emitToRequest(id, SOCKET_EVENTS.BLOOD_RECEIVED, { requestId: id, status: 'COMPLETED' });
    emitToRequest(id, SOCKET_EVENTS.REQUEST_COMPLETED, { requestId: id, status: 'COMPLETED' });
    emitToRole('HOSPITAL', SOCKET_EVENTS.REQUEST_COMPLETED, { requestId: id });
    emitToRole('ADMIN', SOCKET_EVENTS.REQUEST_COMPLETED, { requestId: id });

    await logAudit({
      userId: req.user.id,
      action: 'REQUEST_COMPLETED_BLOOD_RECEIVED',
      entityType: 'BloodRequest',
      entityId: id,
      details: { completedBy: req.user.fullName, notes },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Blood units confirmed received. Request successfully marked as completed.',
      request: updatedRequest,
    });
  } catch (error) {
    console.error('markBloodReceived error:', error);
    return res.status(500).json({ success: false, message: 'Could not complete request.' });
  }
}

export async function triggerManualEscalation(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { stage } = req.body;

    const result = await escalateRequest(id, stage ? parseInt(stage, 10) : undefined);
    return res.json(result);
  } catch (error: any) {
    console.error('triggerManualEscalation error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to escalate request.' });
  }
}

const cancelRequestSchema = z.object({
  reason: z.enum([
    'FOUND_DONOR_EXTERNAL',
    'PATIENT_DISCHARGED',
    'SURGERY_POSTPONED',
    'HOSPITAL_STOCK_FULFILLED',
    'REQUEST_EXPIRED',
    'ENTERED_IN_ERROR',
    'OTHER',
  ]),
  notes: z.string().optional(),
});

export async function cancelBloodRequestHandler(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { id } = req.params;
    const validated = cancelRequestSchema.parse(req.body);

    const request = await prisma.bloodRequest.findUnique({
      where: { id },
      include: {
        hospital: true,
        matches: {
          where: {
            status: { in: ['NOTIFIED', 'ACCEPTED'] },
          },
          include: {
            donor: true,
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Blood request not found.' });
    }

    // Role-based cancellation authorization:
    // Only the creator requester, assigned hospital, or admin can cancel
    const isRequester = request.requesterId === req.user.id;
    const isAssignedHospital = req.user.hospitalProfileId === request.hospitalId;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isRequester && !isAssignedHospital && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not have permission to cancel this blood request.',
      });
    }

    // Validate lifecycle state
    if (!isRequestCancellable(request.status)) {
      return res.status(400).json({
        success: false,
        message: `Request with status '${request.status}' cannot be cancelled.`,
      });
    }

    const activeDonorIds = request.matches.map((m) => m.donorId);

    // Call cancellation service
    const cancellationResult = cancelBloodRequest({
      requestId: id,
      currentStatus: request.status,
      cancelledByUserId: req.user.id,
      cancelledByRole: req.user.role,
      reason: validated.reason as CancellationReason,
      notes: validated.notes,
      activeDonorIds,
    });

    if (!cancellationResult.success) {
      return res.status(400).json({
        success: false,
        message: cancellationResult.error || 'Failed to cancel request.',
      });
    }

    // Update blood request status to CANCELLED in database
    const updatedRequest = await prisma.bloodRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
      },
    });

    // Update active notified matches to EXPIRED
    await prisma.donorMatch.updateMany({
      where: {
        requestId: id,
        status: 'NOTIFIED',
      },
      data: {
        status: 'EXPIRED',
      },
    });

    // Add status history record
    await prisma.requestStatusHistory.create({
      data: {
        requestId: id,
        fromStatus: request.status,
        toStatus: 'CANCELLED',
        changedByUserId: req.user.id,
        reason: `Cancelled (${validated.reason}): ${validated.notes || 'Stand-down alert issued.'}`.trim(),
      },
    });

    // Dispatch stand-down notifications to active donors
    const standDownMessage = generateStandDownMessage(validated.reason as CancellationReason);
    for (const match of request.matches) {
      await createNotification({
        userId: match.donor.userId,
        category: 'SYSTEM',
        title: '⚠️ Stand Down: Blood Request Closed',
        message: standDownMessage,
        linkUrl: '/donor/dashboard',
      });
    }

    // Real-time broadcasts
    emitToRequest(id, SOCKET_EVENTS.REQUEST_CANCELLED, {
      requestId: id,
      reason: validated.reason,
      cancelledBy: req.user.fullName,
      status: 'CANCELLED',
    });
    emitToRole('HOSPITAL', SOCKET_EVENTS.REQUEST_CANCELLED, { requestId: id });
    emitToRole('ADMIN', SOCKET_EVENTS.REQUEST_CANCELLED, { requestId: id });

    await logAudit({
      userId: req.user.id,
      action: 'REQUEST_CANCELLED',
      entityType: 'BloodRequest',
      entityId: id,
      details: {
        reason: validated.reason,
        notes: validated.notes,
        activeDonorsNotified: activeDonorIds.length,
      },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Blood request cancelled successfully. Active donors stood down.',
      request: updatedRequest,
      cancellationRecord: cancellationResult.record,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.errors[0]?.message || 'Validation error',
      });
    }
    console.error('cancelBloodRequestHandler error:', error);
    return res.status(500).json({ success: false, message: 'Failed to cancel blood request.' });
  }
}

