/**
 * BloodBridge Fulfillment Feedback & Appreciation Controller
 */

import { Request, Response } from 'express';
import { prisma } from '../prisma';
import {
  submitDonationFeedback,
  getDonorFeedbackSummary,
} from '../services/feedbackService';
import { createNotification } from '../services/notificationService';
import { logAudit } from '../services/auditService';

export async function submitFeedbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const authorUserId = req.user?.id;
    if (!authorUserId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { requestId, donorId, ratingStars, punctualityScore, gratitudeMessage, anonymous } = req.body;

    if (!requestId || !donorId || ratingStars === undefined) {
      res.status(400).json({
        success: false,
        error: 'Missing required feedback fields (requestId, donorId, ratingStars)',
      });
      return;
    }

    // Verify blood request exists
    const bloodRequest = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: {
        matches: {
          include: { donor: true },
        },
      },
    });

    if (!bloodRequest) {
      res.status(404).json({ success: false, error: 'Blood request not found.' });
      return;
    }

    // Validate request lifecycle state
    if (bloodRequest.status !== 'COMPLETED') {
      res.status(400).json({
        success: false,
        error: 'Feedback can only be submitted for completed blood requests.',
      });
      return;
    }

    // Author authorization check: Only the requester, assigned hospital, or admin can submit feedback
    const isRequester = bloodRequest.requesterId === authorUserId;
    const isAssignedHospital = req.user?.hospitalProfileId === bloodRequest.hospitalId;
    const isAdmin = req.user?.role === 'ADMIN';

    if (!isRequester && !isAssignedHospital && !isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized: You do not have permission to submit feedback for this request.',
      });
      return;
    }

    // Verify donor was an accepted participant on this request
    const acceptedMatch = bloodRequest.matches.find(
      (m) => m.donorId === donorId && m.status === 'ACCEPTED'
    );

    if (!acceptedMatch) {
      res.status(400).json({
        success: false,
        error: 'The specified donor was not an accepted participant for this completed blood request.',
      });
      return;
    }

    const authorRole = (req.user?.role === 'HOSPITAL' ? 'HOSPITAL' : 'REQUESTER') as 'REQUESTER' | 'HOSPITAL';

    const result = submitDonationFeedback({
      requestId,
      authorUserId,
      authorRole,
      donorId,
      ratingStars: Number(ratingStars),
      punctualityScore: punctualityScore !== undefined ? Number(punctualityScore) : undefined,
      gratitudeMessage,
      anonymous: Boolean(anonymous),
    });

    if (!result.success) {
      res.status(409).json({
        success: false,
        error: result.error,
      });
      return;
    }

    // Notify donor of gratitude review
    await createNotification({
      userId: acceptedMatch.donor.userId,
      category: 'BLOOD_RECEIVED',
      title: '⭐ New Gratitude Review & Rating Received',
      message: `${anonymous ? 'A grateful patient family' : req.user?.fullName} left a ${ratingStars}-star rating for request ${requestId}.`,
      linkUrl: '/donor/dashboard',
    });

    // Log security/audit
    await logAudit({
      userId: authorUserId,
      action: 'FEEDBACK_SUBMITTED',
      entityType: 'DonorMatch',
      entityId: acceptedMatch.id,
      details: {
        requestId,
        donorId,
        ratingStars: Number(ratingStars),
        anonymous: Boolean(anonymous),
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: result.feedback,
      message: 'Thank you for submitting feedback for the lifesaving donor!',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export function getDonorFeedbackHandler(req: Request, res: Response): void {
  try {
    const donorId = req.params.donorId || req.query.donorId as string;
    if (!donorId) {
      res.status(400).json({ success: false, error: 'Donor identifier is required' });
      return;
    }

    const summary = getDonorFeedbackSummary(donorId);
    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
