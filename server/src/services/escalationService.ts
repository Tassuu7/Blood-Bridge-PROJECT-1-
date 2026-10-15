import { prisma } from '../prisma';
import { runDonorMatching } from './matchingService';
import { createNotification } from './notificationService';
import { emitToRequest, emitToRole } from '../realtime/socketHandler';
import { SOCKET_EVENTS } from '../realtime/events';
import { config } from '../config';

export async function escalateRequest(requestId: string, forceStage?: number) {
  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: {
      hospital: true,
      matches: {
        where: { status: 'ACCEPTED' },
      },
    },
  });

  if (!request) {
    throw new Error(`Blood request ${requestId} not found.`);
  }

  // Do not escalate if request is completed, cancelled, rejected, unverified, or already has confirmed donor
  if (['COMPLETED', 'REJECTED', 'BLOOD_RECEIVED', 'DONOR_CONFIRMED', 'CANCELLED', 'PENDING_VERIFICATION'].includes(request.status)) {
    return {
      success: false,
      message: `Request is in status '${request.status}' - no escalation permitted.`,
    };
  }

  const nextStage = forceStage || Math.min(5, request.currentEscalationStage + 1);

  let radiusKm = config.escalation.stage1RadiusKm;
  let triggerReason = 'Initial radius broadcast';

  switch (nextStage) {
    case 1:
      radiusKm = config.escalation.stage1RadiusKm;
      triggerReason = 'Stage 1: Immediate neighborhood radius (3 km)';
      break;
    case 2:
      radiusKm = config.escalation.stage2RadiusKm;
      triggerReason = 'Stage 2: Expanded radius (7 km) due to lack of immediate donor response';
      break;
    case 3:
      radiusKm = config.escalation.stage3RadiusKm;
      triggerReason = 'Stage 3: City network radius (15 km) broad search';
      break;
    case 4:
      radiusKm = 25;
      triggerReason = 'Stage 4: Regional volunteer & blood-bank coordination network broadcast';
      break;
    case 5:
      radiusKm = 50;
      triggerReason = 'Stage 5: Platform Admin critical incident escalation';
      break;
  }

  // Run matching with the expanded radius
  const matchResult = await runDonorMatching(requestId, radiusKm);

  // Record escalation event
  const escalationEvent = await prisma.escalationEvent.create({
    data: {
      requestId: request.id,
      stageNumber: nextStage,
      radiusKm: radiusKm,
      donorsNotifiedCount: matchResult.matchedCount,
      triggerReason: triggerReason,
      triggeredAt: new Date(),
    },
  });

  // Update request
  await prisma.bloodRequest.update({
    where: { id: request.id },
    data: {
      currentEscalationStage: nextStage,
    },
  });

  // Notify requester of escalation
  await createNotification({
    userId: request.requesterId,
    category: 'ESCALATION',
    title: `⚡ Search Radius Expanded (Stage ${nextStage})`,
    message: `Blood search radius expanded to ${radiusKm} km. ${matchResult.matchedCount} compatible donors contacted.`,
    linkUrl: `/requester/dashboard?request=${request.id}`,
  });

  // If Stage 4 or 5, alert admins
  if (nextStage >= 4) {
    emitToRole('ADMIN', SOCKET_EVENTS.REQUEST_ESCALATED, {
      requestId: request.id,
      stage: nextStage,
      radiusKm,
      bloodGroup: request.bloodGroup,
      hospitalName: request.hospital.hospitalName,
    });
  }

  // Real-time broadcast to request room
  emitToRequest(request.id, SOCKET_EVENTS.REQUEST_ESCALATED, {
    requestId: request.id,
    stageNumber: nextStage,
    radiusKm,
    triggerReason,
    matchedCount: matchResult.matchedCount,
  });

  emitToRequest(request.id, SOCKET_EVENTS.RADIUS_EXPANDED, {
    requestId: request.id,
    radiusKm,
    stage: nextStage,
  });

  return {
    success: true,
    stage: nextStage,
    radiusKm,
    matchedCount: matchResult.matchedCount,
    escalationEvent,
  };
}
