import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { prisma } from '../prisma';
import { config } from '../config';
import { resetFeedbackStore } from '../services/feedbackService';

describe('Feedback Integration & Participant Verification Guards', () => {
  let requesterToken: string;
  let requesterUserId: string;
  let otherRequesterToken: string;
  let hospitalToken: string;
  let acceptedDonorId: string;
  let otherDonorId: string;

  let completedRequestId: string;
  let activeRequestId: string;

  beforeAll(async () => {
    resetFeedbackStore();

    const requester = await prisma.user.findFirst({ where: { role: 'REQUESTER' } });
    const hospital = await prisma.hospitalProfile.findFirst({ include: { user: true } });
    const donors = await prisma.donorProfile.findMany({ include: { user: true } });

    if (!requester || !hospital || donors.length === 0) {
      throw new Error('Seed data required for feedback guards tests.');
    }

    requesterUserId = requester.id;
    acceptedDonorId = donors[0].id;

    // Ensure we have a second donor
    if (donors.length > 1) {
      otherDonorId = donors[1].id;
    } else {
      const user2 = await prisma.user.create({
        data: {
          email: `other.donor.${Date.now()}@bloodbridge.demo`,
          fullName: 'Other Donor',
          passwordHash: 'dummy_hash',
          role: 'DONOR',
        },
      });
      const d2 = await prisma.donorProfile.create({
        data: {
          userId: user2.id,
          bloodGroup: 'B+',
          addressCity: 'Metro City',
        },
      });
      otherDonorId = d2.id;
    }

    // Create a secondary unrelated requester
    const otherReqUser = await prisma.user.create({
      data: {
        email: `unrelated.req.${Date.now()}@bloodbridge.demo`,
        fullName: 'Unrelated Requester',
        passwordHash: 'dummy_hash',
        role: 'REQUESTER',
        status: 'ACTIVE',
      },
    });

    requesterToken = jwt.sign({ id: requester.id, email: requester.email, role: requester.role }, config.jwtSecret, { expiresIn: '1h' });
    otherRequesterToken = jwt.sign({ id: otherReqUser.id, email: otherReqUser.email, role: otherReqUser.role }, config.jwtSecret, { expiresIn: '1h' });
    hospitalToken = jwt.sign({ id: hospital.user.id, email: hospital.user.email, role: hospital.user.role }, config.jwtSecret, { expiresIn: '1h' });

    const timestamp = Date.now().toString().slice(-4);

    // 1. Completed request with accepted donor match
    const cReq = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-FB-C-${timestamp}`,
        requesterId: requesterUserId,
        hospitalId: hospital.id,
        patientInitials: 'F.B.',
        bloodGroup: 'O+',
        unitsRequired: 1,
        urgency: 'URGENT',
        status: 'COMPLETED',
        requiredBy: new Date(Date.now() + 5 * 3600 * 1000),
      },
    });
    completedRequestId = cReq.id;

    await prisma.donorMatch.create({
      data: {
        requestId: completedRequestId,
        donorId: acceptedDonorId,
        matchScore: 95,
        distanceKm: 2.5,
        status: 'ACCEPTED',
        notifiedAt: new Date(Date.now() - 3600 * 1000),
        respondedAt: new Date(Date.now() - 3000 * 1000),
      },
    });

    // 2. Active, uncompleted request
    const aReq = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-FB-A-${timestamp}`,
        requesterId: requesterUserId,
        hospitalId: hospital.id,
        patientInitials: 'F.A.',
        bloodGroup: 'A+',
        unitsRequired: 1,
        urgency: 'URGENT',
        status: 'DONORS_NOTIFIED',
        requiredBy: new Date(Date.now() + 6 * 3600 * 1000),
      },
    });
    activeRequestId = aReq.id;
  });

  it('rejects unauthenticated feedback submissions with 401', async () => {
    const res = await request(app).post('/api/feedback').send({
      requestId: completedRequestId,
      donorId: acceptedDonorId,
      ratingStars: 5,
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 if the blood request does not exist', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        requestId: 'BB-NON-EXISTENT-REQUEST-999',
        donorId: acceptedDonorId,
        ratingStars: 5,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('returns 400 if blood request is not yet COMPLETED', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        requestId: activeRequestId,
        donorId: acceptedDonorId,
        ratingStars: 5,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('completed blood requests');
  });

  it('returns 403 Forbidden when an unrelated third party attempts to submit feedback', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${otherRequesterToken}`)
      .send({
        requestId: completedRequestId,
        donorId: acceptedDonorId,
        ratingStars: 5,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('returns 400 if the specified donor was NOT an accepted participant for that request', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        requestId: completedRequestId,
        donorId: otherDonorId, // didn't participate
        ratingStars: 5,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not an accepted participant');
  });

  it('successfully submits feedback and gratitude review for valid accepted donor', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        requestId: completedRequestId,
        donorId: acceptedDonorId,
        ratingStars: 5,
        punctualityScore: 5,
        gratitudeMessage: 'The donor reached within 25 minutes and was exceptionally supportive!',
        anonymous: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ratingStars).toBe(5);
  });

  it('prevents duplicate feedback submission on the same completed request', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        requestId: completedRequestId,
        donorId: acceptedDonorId,
        ratingStars: 4,
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('already been submitted');
  });
});
