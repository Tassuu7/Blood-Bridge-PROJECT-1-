import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../prisma';
import { processHospitalVerification } from '../services/verificationService';
import { getInventoryHandler, restockInventoryHandler } from '../controllers/inventoryController';
import { getStaffHandler, addStaffHandler } from '../controllers/hospitalStaffController';
import { registerWebhookHandler } from '../controllers/webhookController';
import { Request, Response } from 'express';

describe('Hospital Scoping and Profile Resolution Security Guards', () => {
  let hospital1Id: string;
  let hospital1UserId: string;
  let hospital2Id: string;
  let hospital2UserId: string;
  let requesterUserId: string;
  let testRequestId: string;

  beforeAll(async () => {
    const requester = await prisma.user.findFirst({ where: { role: 'REQUESTER' } });
    const hospitalProfiles = await prisma.hospitalProfile.findMany({ include: { user: true } });

    if (!requester || hospitalProfiles.length === 0) {
      throw new Error('Seed data required for hospital scoping tests.');
    }

    requesterUserId = requester.id;
    hospital1Id = hospitalProfiles[0].id;
    hospital1UserId = hospitalProfiles[0].userId;

    if (hospitalProfiles.length > 1) {
      hospital2Id = hospitalProfiles[1].id;
      hospital2UserId = hospitalProfiles[1].userId;
    } else {
      // Create a secondary hospital profile for cross-hospital isolation test
      const user2 = await prisma.user.create({
        data: {
          email: `test_hosp2_${Date.now()}@bloodbridge.demo`,
          passwordHash: 'dummy_hash',
          fullName: 'City General Hospital',
          role: 'HOSPITAL',
        },
      });
      const hosp2 = await prisma.hospitalProfile.create({
        data: {
          userId: user2.id,
          hospitalName: 'City General Hospital',
          licenseNumber: `LIC-${Date.now()}`,
          address: '456 North Avenue',
          latitude: 28.7041,
          longitude: 77.1025,
        },
      });
      hospital2Id = hosp2.id;
      hospital2UserId = user2.id;
    }

    // Create a test blood request assigned to hospital1
    const req = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-SCOPE-${Date.now().toString().slice(-4)}`,
        requesterId: requesterUserId,
        hospitalId: hospital1Id,
        patientInitials: 'S.V.',
        bloodGroup: 'B+',
        unitsRequired: 2,
        urgency: 'URGENT',
        status: 'PENDING_VERIFICATION',
        requiredBy: new Date(Date.now() + 4 * 60 * 60 * 1000),
      },
    });
    testRequestId = req.id;
  });

  it('rejects verification attempt from an unauthorized cross-hospital facility', async () => {
    // hospital2 attempts to verify request assigned to hospital1
    await expect(
      processHospitalVerification({
        requestId: testRequestId,
        hospitalId: hospital2Id,
        verifiedByUserId: hospital2UserId,
        status: 'VERIFIED',
        reviewNotes: 'Cross-hospital rogue verification attempt',
      })
    ).rejects.toThrow(/Unauthorized: Hospital/);
  });

  it('allows verification by the designated hospital facility', async () => {
    const result = await processHospitalVerification({
      requestId: testRequestId,
      hospitalId: hospital1Id,
      verifiedByUserId: hospital1UserId,
      status: 'VERIFIED',
      reviewNotes: 'Authorized facility verification.',
    });

    expect(result.newStatus).toBe('MATCHING_IN_PROGRESS');
  });

  it('rejects reverification of a request that is no longer in PENDING_VERIFICATION', async () => {
    await expect(
      processHospitalVerification({
        requestId: testRequestId,
        hospitalId: hospital1Id,
        verifiedByUserId: hospital1UserId,
        status: 'VERIFIED',
        reviewNotes: 'Duplicate verification on active request',
      })
    ).rejects.toThrow(/Invalid state: Request/);
  });

  it('resolves hospitalProfileId correctly in inventoryController without requiring explicit body or query hospitalId', () => {
    let responseStatus = 0;
    let responseData: any = null;

    const mockReq = {
      user: {
        id: 'usr_hosp_test',
        email: 'hosp@test.org',
        role: 'HOSPITAL',
        fullName: 'Test Hospital Staff',
        hospitalProfileId: 'hosp_profile_test_123',
      },
      query: {},
      body: {},
    } as unknown as Request;

    const mockRes = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
    } as unknown as Response;

    getInventoryHandler(mockReq, mockRes);
    expect(responseStatus).not.toBe(400);
    expect(responseData?.success).toBe(true);
    expect(responseData?.data?.inventory).toBeDefined();
  });

  it('resolves hospitalProfileId correctly in hospitalStaffController', () => {
    let responseStatus = 0;
    let responseData: any = null;

    const mockReq = {
      user: {
        id: 'usr_hosp_test',
        email: 'hosp@test.org',
        role: 'HOSPITAL',
        fullName: 'Test Hospital Staff',
        hospitalProfileId: 'hosp_profile_test_123',
      },
      query: {},
      body: {},
    } as unknown as Request;

    const mockRes = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
    } as unknown as Response;

    getStaffHandler(mockReq, mockRes);
    expect(responseStatus).not.toBe(400);
    expect(responseData?.success).toBe(true);
    expect(responseData?.data).toBeDefined();
  });

  it('resolves hospitalProfileId correctly in webhookController', () => {
    let responseStatus = 0;
    let responseData: any = null;

    const mockReq = {
      user: {
        id: 'usr_hosp_test',
        email: 'hosp@test.org',
        role: 'HOSPITAL',
        fullName: 'Test Hospital Staff',
        hospitalProfileId: 'hosp_profile_test_123',
      },
      body: {
        targetUrl: 'https://hms.hospital.org/webhooks/bloodbridge',
        secretKey: 'sec_test_hmac_key_99999',
        events: ['REQUEST_VERIFIED'],
      },
    } as unknown as Request;

    const mockRes = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
    } as unknown as Response;

    registerWebhookHandler(mockReq, mockRes);
    expect(responseStatus).toBe(201);
    expect(responseData?.success).toBe(true);
    expect(responseData?.data?.hospitalId).toBe('hosp_profile_test_123');
  });
});
