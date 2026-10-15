import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../prisma';
import { respondToMatch } from '../controllers/donorsController';
import { Request, Response } from 'express';

describe('Donor Match Response State Machine & Guard Tests', () => {
  let donor1UserId: string;
  let donor1ProfileId: string;
  let donor2UserId: string;
  let requesterUserId: string;
  let hospitalId: string;
  let testRequestId: string;
  let testMatchId: string;

  beforeAll(async () => {
    const requester = await prisma.user.findFirst({ where: { role: 'REQUESTER' } });
    const hospital = await prisma.hospitalProfile.findFirst();
    const donors = await prisma.donorProfile.findMany({ include: { user: true } });

    if (!requester || !hospital || donors.length === 0) {
      throw new Error('Seed data required for match response tests.');
    }

    requesterUserId = requester.id;
    hospitalId = hospital.id;
    donor1ProfileId = donors[0].id;
    donor1UserId = donors[0].userId;

    if (donors.length > 1) {
      donor2UserId = donors[1].userId;
    } else {
      const user2 = await prisma.user.create({
        data: {
          email: `donor2_${Date.now()}@bloodbridge.demo`,
          passwordHash: 'dummy_hash',
          fullName: 'Secondary Donor',
          role: 'DONOR',
        },
      });
      donor2UserId = user2.id;
    }

    // Create a blood request in DONORS_NOTIFIED status
    const req = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-MATCH-${Date.now().toString().slice(-4)}`,
        requesterId: requesterUserId,
        hospitalId: hospitalId,
        patientInitials: 'A.R.',
        bloodGroup: 'O+',
        unitsRequired: 1,
        urgency: 'URGENT',
        status: 'DONORS_NOTIFIED',
        requiredBy: new Date(Date.now() + 3 * 60 * 60 * 1000),
      },
    });
    testRequestId = req.id;

    // Create an initial NOTIFIED match for donor1
    const match = await prisma.donorMatch.create({
      data: {
        requestId: testRequestId,
        donorId: donor1ProfileId,
        matchScore: 92,
        distanceKm: 3.5,
        status: 'NOTIFIED',
        notifiedAt: new Date(),
      },
    });
    testMatchId = match.id;
  });

  function createMockContext(userId: string, matchId: string, body: any) {
    let responseStatus = 200;
    let responseData: any = null;

    const req = {
      user: {
        id: userId,
        role: 'DONOR',
      },
      params: { matchId },
      body,
      ip: '127.0.0.1',
    } as unknown as Request;

    const res = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
    } as unknown as Response;

    return { req, res, getStatus: () => responseStatus, getData: () => responseData };
  }

  it('rejects invalid action with 400 Bad Request', async () => {
    const { req, res, getStatus, getData } = createMockContext(donor1UserId, testMatchId, {
      action: 'INVALID_ACTION',
    });

    await respondToMatch(req, res);
    expect(getStatus()).toBe(400);
    expect(getData()?.success).toBe(false);
  });

  it('rejects non-existent match with 404 Not Found', async () => {
    const { req, res, getStatus, getData } = createMockContext(donor1UserId, 'non-existent-match-id', {
      action: 'ACCEPT',
    });

    await respondToMatch(req, res);
    expect(getStatus()).toBe(404);
    expect(getData()?.success).toBe(false);
  });

  it('rejects response from unauthorized user who does not own the donor match profile', async () => {
    const { req, res, getStatus, getData } = createMockContext(donor2UserId, testMatchId, {
      action: 'ACCEPT',
    });

    await respondToMatch(req, res);
    expect(getStatus()).toBe(403);
    expect(getData()?.success).toBe(false);
    expect(getData()?.message).toContain('Unauthorized');
  });

  it('successfully accepts match when valid and transitions request to DONOR_CONFIRMED', async () => {
    const { req, res, getStatus, getData } = createMockContext(donor1UserId, testMatchId, {
      action: 'ACCEPT',
    });

    await respondToMatch(req, res);
    expect(getStatus()).toBe(200);
    expect(getData()?.success).toBe(true);
    expect(getData()?.match?.status).toBe('ACCEPTED');

    const updatedRequest = await prisma.bloodRequest.findUnique({
      where: { id: testRequestId },
    });
    expect(updatedRequest?.status).toBe('DONOR_CONFIRMED');
  });

  it('rejects duplicate response to an already accepted match with 409 Conflict', async () => {
    const { req, res, getStatus, getData } = createMockContext(donor1UserId, testMatchId, {
      action: 'ACCEPT',
    });

    await respondToMatch(req, res);
    expect(getStatus()).toBe(409);
    expect(getData()?.success).toBe(false);
    expect(getData()?.message).toContain('already been processed');
  });

  it('rejects response when request has already been completed with 409 Conflict', async () => {
    // Create new request and match
    const completedReq = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-COMPL-${Date.now().toString().slice(-4)}`,
        requesterId: requesterUserId,
        hospitalId: hospitalId,
        patientInitials: 'C.L.',
        bloodGroup: 'B+',
        unitsRequired: 1,
        urgency: 'NORMAL',
        status: 'COMPLETED',
        requiredBy: new Date(Date.now() + 5 * 60 * 60 * 1000),
      },
    });

    const matchForCompleted = await prisma.donorMatch.create({
      data: {
        requestId: completedReq.id,
        donorId: donor1ProfileId,
        matchScore: 88,
        distanceKm: 2.1,
        status: 'NOTIFIED',
        notifiedAt: new Date(),
      },
    });

    const { req, res, getStatus, getData } = createMockContext(donor1UserId, matchForCompleted.id, {
      action: 'ACCEPT',
    });

    await respondToMatch(req, res);
    expect(getStatus()).toBe(409);
    expect(getData()?.success).toBe(false);
    expect(getData()?.message).toContain('can no longer accept new responses');
  });
});
