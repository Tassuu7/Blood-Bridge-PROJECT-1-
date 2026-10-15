import { prisma } from '../prisma';
import { runDonorMatching } from './matchingService';
import { createNotification } from './notificationService';
import { logAudit } from './auditService';
import { emitToRequest, emitToRole, emitToUser } from '../realtime/socketHandler';
import { SOCKET_EVENTS } from '../realtime/events';
import { VerificationStatus } from '../../../shared/types';

export async function processHospitalVerification(params: {
  requestId: string;
  hospitalId: string;
  verifiedByUserId: string;
  status: VerificationStatus;
  reviewNotes?: string;
  ipAddress?: string;
}) {
  const { requestId, hospitalId, verifiedByUserId, status, reviewNotes, ipAddress } = params;

  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: {
      hospital: true,
      requester: true,
    },
  });

  if (!request) {
    throw new Error(`Blood request ${requestId} not found.`);
  }

  // Verification security check: Ensure request belongs to the verifying hospital facility
  if (request.hospitalId !== hospitalId) {
    throw new Error(`Unauthorized: Hospital ${hospitalId} is not assigned to blood request ${requestId}.`);
  }

  // Lifecycle state guard: Only pending verification requests can undergo clinical verification
  if (request.status !== 'PENDING_VERIFICATION') {
    throw new Error(`Invalid state: Request ${requestId} is currently in '${request.status}' and cannot be reverified.`);
  }

  // Create verification record
  const verificationRecord = await prisma.verificationRecord.create({
    data: {
      requestId,
      hospitalId,
      verifiedByUserId,
      status,
      reviewNotes: reviewNotes || null,
      verifiedAt: new Date(),
    },
  });

  let newRequestStatus = request.status;

  if (status === 'VERIFIED') {
    newRequestStatus = 'MATCHING_IN_PROGRESS';

    // Increment hospital's total verified count
    await prisma.hospitalProfile.update({
      where: { id: hospitalId },
      data: {
        totalVerifiedRequests: { increment: 1 },
      },
    });

    // Update request
    await prisma.bloodRequest.update({
      where: { id: requestId },
      data: {
        status: newRequestStatus,
      },
    });

    // Log status history
    await prisma.requestStatusHistory.create({
      data: {
        requestId,
        fromStatus: request.status,
        toStatus: newRequestStatus,
        changedByUserId: verifiedByUserId,
        reason: `Hospital verified genuine emergency. ${reviewNotes || ''}`.trim(),
      },
    });

    // Notify requester
    await createNotification({
      userId: request.requesterId,
      category: 'VERIFICATION_UPDATE',
      title: '✅ Hospital Verified Your Request',
      message: `${request.hospital.hospitalName} confirmed your request. Smart donor matching is now actively searching for donors.`,
      linkUrl: `/requester/dashboard?request=${request.id}`,
    });

    // Emit real-time events
    emitToRequest(requestId, SOCKET_EVENTS.REQUEST_VERIFIED, {
      requestId,
      status: newRequestStatus,
      hospitalName: request.hospital.hospitalName,
      verifiedAt: verificationRecord.verifiedAt,
    });
    emitToRole('ADMIN', SOCKET_EVENTS.REQUEST_VERIFIED, { requestId, hospitalId });

    // Trigger smart donor matching
    try {
      await runDonorMatching(requestId);
    } catch (err) {
      console.error('Error running donor matching after verification:', err);
    }
  } else if (status === 'REJECTED') {
    newRequestStatus = 'REJECTED';

    await prisma.bloodRequest.update({
      where: { id: requestId },
      data: { status: newRequestStatus },
    });

    await prisma.requestStatusHistory.create({
      data: {
        requestId,
        fromStatus: request.status,
        toStatus: newRequestStatus,
        changedByUserId: verifiedByUserId,
        reason: `Request rejected by hospital: ${reviewNotes || 'Verification failed.'}`,
      },
    });

    await createNotification({
      userId: request.requesterId,
      category: 'VERIFICATION_UPDATE',
      title: '❌ Blood Request Verification Declined',
      message: `Hospital did not verify the emergency request. Reason: ${reviewNotes || 'Hospital records could not verify patient necessity.'}`,
      linkUrl: `/requester/dashboard?request=${request.id}`,
    });

    emitToRequest(requestId, SOCKET_EVENTS.REQUEST_REJECTED, {
      requestId,
      status: newRequestStatus,
      reason: reviewNotes,
    });
  } else if (status === 'INFO_REQUESTED') {
    await createNotification({
      userId: request.requesterId,
      category: 'VERIFICATION_UPDATE',
      title: 'ℹ️ Additional Patient Information Needed',
      message: `${request.hospital.hospitalName} requests further details: ${reviewNotes || 'Please contact the hospital front desk.'}`,
      linkUrl: `/requester/dashboard?request=${request.id}`,
    });
  }

  // Log audit
  await logAudit({
    userId: verifiedByUserId,
    action: `HOSPITAL_VERIFICATION_${status}`,
    entityType: 'BloodRequest',
    entityId: requestId,
    details: { hospitalId, status, reviewNotes },
    ipAddress,
  });

  return {
    verificationRecord,
    newStatus: newRequestStatus,
  };
}
