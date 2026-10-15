import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { createNotification } from '../services/notificationService';
import { logAudit } from '../services/auditService';
import { escalateRequest } from '../services/escalationService';
import { emitToRequest, emitToRole, emitToUser } from '../realtime/socketHandler';
import { SOCKET_EVENTS } from '../realtime/events';
import { AvailabilityStatus } from '../../../shared/types';

export async function updateAvailability(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { status } = req.body;
    if (!['AVAILABLE', 'AVAILABLE_LATER', 'NOT_AVAILABLE'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid availability status. Must be AVAILABLE, AVAILABLE_LATER, or NOT_AVAILABLE.',
      });
    }

    const donorProfile = await prisma.donorProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!donorProfile) {
      return res.status(404).json({ success: false, message: 'Donor profile not found.' });
    }

    const updated = await prisma.donorProfile.update({
      where: { id: donorProfile.id },
      data: { availabilityStatus: status as AvailabilityStatus },
    });

    await logAudit({
      userId: req.user.id,
      action: 'DONOR_AVAILABILITY_CHANGED',
      entityType: 'DonorProfile',
      entityId: donorProfile.id,
      details: { newStatus: status },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: `Availability updated to ${status}.`,
      profile: updated,
    });
  } catch (error) {
    console.error('updateAvailability error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update availability.' });
  }
}

export async function getDonorDashboard(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const donorProfile = await prisma.donorProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!donorProfile) {
      return res.status(404).json({ success: false, message: 'Donor profile not found.' });
    }

    // Active incoming emergency requests (status = NOTIFIED on active blood requests)
    const incomingRequests = await prisma.donorMatch.findMany({
      where: {
        donorId: donorProfile.id,
        status: 'NOTIFIED',
        bloodRequest: {
          status: {
            in: ['DONORS_NOTIFIED', 'MATCHING_IN_PROGRESS', 'HOSPITAL_VERIFIED'],
          },
        },
      },
      include: {
        bloodRequest: {
          include: {
            hospital: true,
          },
        },
      },
      orderBy: { notifiedAt: 'desc' },
    });

    // Active commitments (status = ACCEPTED on requests not yet completed)
    const activeCommitments = await prisma.donorMatch.findMany({
      where: {
        donorId: donorProfile.id,
        status: 'ACCEPTED',
        bloodRequest: {
          status: {
            in: ['DONOR_CONFIRMED', 'DONORS_NOTIFIED'],
          },
        },
      },
      include: {
        bloodRequest: {
          include: {
            hospital: true,
            requester: {
              select: {
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { respondedAt: 'desc' },
    });

    // Completed donation history
    const donationHistory = await prisma.donorMatch.findMany({
      where: {
        donorId: donorProfile.id,
        status: 'ACCEPTED',
        bloodRequest: {
          status: 'COMPLETED',
        },
      },
      include: {
        bloodRequest: {
          include: {
            hospital: true,
          },
        },
      },
      orderBy: { respondedAt: 'desc' },
    });

    return res.json({
      success: true,
      profile: donorProfile,
      incomingRequests,
      activeCommitments,
      donationHistory,
      stats: {
        totalDonations: donorProfile.totalDonations,
        reliabilityScore: donorProfile.reliabilityScore,
        pendingInvites: incomingRequests.length,
        activeCommitments: activeCommitments.length,
      },
    });
  } catch (error) {
    console.error('getDonorDashboard error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch donor dashboard.' });
  }
}

export async function respondToMatch(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { matchId } = req.params;
    const { action, declineReason } = req.body;

    if (!['ACCEPT', 'DECLINE'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Must be 'ACCEPT' or 'DECLINE'.",
      });
    }

    const match = await prisma.donorMatch.findUnique({
      where: { id: matchId },
      include: {
        bloodRequest: {
          include: {
            hospital: true,
            requester: true,
          },
        },
        donor: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!match) {
      return res.status(404).json({ success: false, message: 'Match record not found.' });
    }

    // Verify requesting user owns this donor profile
    if (match.donor.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized response to this match.' });
    }

    // Guard 1: Prevent duplicate responses to an already processed match
    if (match.status !== 'NOTIFIED') {
      return res.status(409).json({
        success: false,
        message: `This match invitation has already been processed with status '${match.status}'.`,
      });
    }

    // Guard 2: Ensure the associated blood request is still active and accepting donors
    const activeRequestStatuses = [
      'DONORS_NOTIFIED',
      'MATCHING_IN_PROGRESS',
      'HOSPITAL_VERIFIED',
    ];
    if (!activeRequestStatuses.includes(match.bloodRequest.status)) {
      return res.status(409).json({
        success: false,
        message: `This emergency request has already transitioned to '${match.bloodRequest.status}' and can no longer accept new responses.`,
      });
    }

    const respondedAt = new Date();
    const responseTimeSeconds = Math.round(
      (respondedAt.getTime() - new Date(match.notifiedAt).getTime()) / 1000
    );

    if (action === 'ACCEPT') {
      // Update match
      const updatedMatch = await prisma.donorMatch.update({
        where: { id: matchId },
        data: {
          status: 'ACCEPTED',
          respondedAt,
          responseTimeSeconds,
        },
      });

      // Update blood request status to DONOR_CONFIRMED
      await prisma.bloodRequest.update({
        where: { id: match.requestId },
        data: {
          status: 'DONOR_CONFIRMED',
        },
      });

      // Add status change history
      await prisma.requestStatusHistory.create({
        data: {
          requestId: match.requestId,
          fromStatus: match.bloodRequest.status,
          toStatus: 'DONOR_CONFIRMED',
          changedByUserId: req.user.id,
          reason: `Donor ${match.donor.isAnonymous ? 'Anonymized Hero' : match.donor.user.fullName} accepted emergency call.`,
        },
      });

      // Notify Requester
      await createNotification({
        userId: match.bloodRequest.requesterId,
        category: 'REQUEST_ACCEPTED',
        title: '🎉 Donor Confirmed for Your Emergency Request!',
        message: `A compatible ${match.donor.bloodGroup} donor has accepted request ${match.bloodRequest.id} and is coordinating with ${match.bloodRequest.hospital.hospitalName}.`,
        linkUrl: `/requester/dashboard?request=${match.requestId}`,
      });

      // Notify Hospital
      await createNotification({
        userId: match.bloodRequest.hospital.userId,
        category: 'REQUEST_ACCEPTED',
        title: `Donor Accepted Request ${match.bloodRequest.id}`,
        message: `Donor is en route to ${match.bloodRequest.hospital.hospitalName} for patient ${match.bloodRequest.patientInitials}.`,
        linkUrl: `/hospital/dashboard?request=${match.requestId}`,
      });

      // Real-time broadcasts
      const payload = {
        requestId: match.requestId,
        matchId: match.id,
        donorName: match.donor.isAnonymous ? 'Generous Donor' : match.donor.user.fullName,
        bloodGroup: match.donor.bloodGroup,
        status: 'DONOR_CONFIRMED',
      };

      emitToRequest(match.requestId, SOCKET_EVENTS.DONOR_ACCEPTED, payload);
      emitToRole('HOSPITAL', SOCKET_EVENTS.DONOR_ACCEPTED, payload);
      emitToRole('ADMIN', SOCKET_EVENTS.DONOR_ACCEPTED, payload);

      await logAudit({
        userId: req.user.id,
        action: 'DONOR_ACCEPTED_MATCH',
        entityType: 'DonorMatch',
        entityId: match.id,
        details: { requestId: match.requestId, responseTimeSeconds },
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        message: 'You have accepted the donation request! Thank you for stepping up.',
        match: updatedMatch,
      });
    } else {
      // DECLINE
      const updatedMatch = await prisma.donorMatch.update({
        where: { id: matchId },
        data: {
          status: 'DECLINED',
          declineReason: declineReason || 'Unavailable at this moment',
          respondedAt,
          responseTimeSeconds,
        },
      });

      emitToRequest(match.requestId, SOCKET_EVENTS.DONOR_DECLINED, {
        requestId: match.requestId,
        matchId: match.id,
      });

      await logAudit({
        userId: req.user.id,
        action: 'DONOR_DECLINED_MATCH',
        entityType: 'DonorMatch',
        entityId: match.id,
        details: { requestId: match.requestId, reason: declineReason },
        ipAddress: req.ip,
      });

      // Check if any other accepted or notified matches remain
      const remainingActiveMatches = await prisma.donorMatch.count({
        where: {
          requestId: match.requestId,
          status: { in: ['NOTIFIED', 'ACCEPTED'] },
        },
      });

      // If no active matches left, trigger radius escalation automatically!
      if (remainingActiveMatches === 0) {
        try {
          await escalateRequest(match.requestId);
        } catch (err) {
          console.error('Auto-escalation failed after decline:', err);
        }
      }

      return res.json({
        success: true,
        message: 'Request declined. Thank you for your prompt response.',
        match: updatedMatch,
      });
    }
  } catch (error) {
    console.error('respondToMatch error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process match response.' });
  }
}
