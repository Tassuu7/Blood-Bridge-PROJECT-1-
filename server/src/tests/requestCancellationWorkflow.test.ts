import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../prisma';
import { cancelBloodRequestHandler, markBloodReceived } from '../controllers/requestsController';
import { isRequestCancellable } from '../services/cancellationService';
import { Request, Response } from 'express';

describe('Emergency Request Cancellation & Stand-Down Workflow Integration', () => {
  let requesterId: string;
  let unauthorizedUserId: string;
  let hospitalId: string;
  let hospitalUserId: string;
  let donorUserId: string;
  let donorProfileId: string;
  let activeRequestId: string;
  let matchId: string;

  beforeAll(async () => {
    const requester = await prisma.user.findFirst({ where: { role: 'REQUESTER' } });
    const hospital = await prisma.hospitalProfile.findFirst({ include: { user: true } });
    const donor = await prisma.donorProfile.findFirst({ include: { user: true } });

    if (!requester || !hospital || !donor) {
      throw new Error('Seed data required for cancellation workflow tests.');
    }

    requesterId = requester.id;
    hospitalId = hospital.id;
    hospitalUserId = hospital.userId;
    donorProfileId = donor.id;
    donorUserId = donor.userId;

    // Create unauthorized third-party user
    const unauthorizedUser = await prisma.user.create({
      data: {
        email: `unauthorized_${Date.now()}@bloodbridge.demo`,
        passwordHash: 'dummy_hash',
        fullName: 'Unauthorized Bystander',
        role: 'REQUESTER',
      },
    });
    unauthorizedUserId = unauthorizedUser.id;

    // Create a live emergency request with a matched donor
    const bloodReq = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-CANCEL-${Date.now().toString().slice(-4)}`,
        requesterId,
        hospitalId,
        patientInitials: 'M.K.',
        bloodGroup: 'O-',
        unitsRequired: 1,
        urgency: 'CRITICAL',
        status: 'DONORS_NOTIFIED',
        requiredBy: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
    activeRequestId = bloodReq.id;

    // Create a donor match in NOTIFIED state
    const match = await prisma.donorMatch.create({
      data: {
        requestId: activeRequestId,
        donorId: donorProfileId,
        matchScore: 95,
        distanceKm: 4.2,
        status: 'NOTIFIED',
        notifiedAt: new Date(),
      },
    });
    matchId = match.id;
  });

  it('validates canonical and legacy cancellable statuses correctly', () => {
    expect(isRequestCancellable('PENDING_VERIFICATION')).toBe(true);
    expect(isRequestCancellable('HOSPITAL_VERIFIED')).toBe(true);
    expect(isRequestCancellable('MATCHING_IN_PROGRESS')).toBe(true);
    expect(isRequestCancellable('DONORS_NOTIFIED')).toBe(true);
    expect(isRequestCancellable('DONOR_CONFIRMED')).toBe(true);

    expect(isRequestCancellable('COMPLETED')).toBe(false);
    expect(isRequestCancellable('CANCELLED')).toBe(false);
    expect(isRequestCancellable('REJECTED')).toBe(false);
  });

  it('rejects cancellation attempt by unauthorized user', async () => {
    let responseStatus = 0;
    let responseData: any = null;

    const mockReq = {
      user: {
        id: unauthorizedUserId,
        email: 'unauthorized@demo.org',
        role: 'REQUESTER',
        fullName: 'Unauthorized Bystander',
      },
      params: { id: activeRequestId },
      body: {
        reason: 'PATIENT_DISCHARGED',
        notes: 'Unauthorized cancel attempt',
      },
      ip: '127.0.0.1',
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

    await cancelBloodRequestHandler(mockReq, mockRes);
    expect(responseStatus).toBe(403);
    expect(responseData?.success).toBe(false);
    expect(responseData?.message).toContain('Unauthorized');
  });

  it('allows authorized requester to cancel active request and dispatches donor stand-down', async () => {
    let responseStatus = 0;
    let responseData: any = null;

    const mockReq = {
      user: {
        id: requesterId,
        email: 'requester@demo.bloodbridge.org',
        role: 'REQUESTER',
        fullName: 'Anita Requester',
      },
      params: { id: activeRequestId },
      body: {
        reason: 'FOUND_DONOR_EXTERNAL',
        notes: 'Family member arrived to donate directly.',
      },
      ip: '127.0.0.1',
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

    await cancelBloodRequestHandler(mockReq, mockRes);
    expect(responseStatus).not.toBe(400);
    expect(responseStatus).not.toBe(403);
    expect(responseData?.success).toBe(true);
    expect(responseData?.request?.status).toBe('CANCELLED');

    // Verify database state updated
    const updatedInDb = await prisma.bloodRequest.findUnique({
      where: { id: activeRequestId },
      include: {
        matches: true,
        statusHistory: true,
      },
    });
    expect(updatedInDb?.status).toBe('CANCELLED');

    // Verify active matches expired
    const updatedMatch = updatedInDb?.matches.find((m) => m.id === matchId);
    expect(updatedMatch?.status).toBe('EXPIRED');

    // Verify status history contains cancellation reason
    const historyEntry = updatedInDb?.statusHistory.find((h) => h.toStatus === 'CANCELLED');
    expect(historyEntry).toBeDefined();
    expect(historyEntry?.reason).toContain('FOUND_DONOR_EXTERNAL');

    // Verify stand-down notification delivered to donor
    const standDownNotification = await prisma.notification.findFirst({
      where: {
        userId: donorUserId,
        title: { contains: 'Stand Down' },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(standDownNotification).toBeDefined();
    expect(standDownNotification?.message).toContain('matching donor has arrived on-site');
  });

  it('rejects subsequent cancellation on an already cancelled request', async () => {
    let responseStatus = 0;
    let responseData: any = null;

    const mockReq = {
      user: {
        id: requesterId,
        email: 'requester@demo.bloodbridge.org',
        role: 'REQUESTER',
        fullName: 'Anita Requester',
      },
      params: { id: activeRequestId },
      body: {
        reason: 'PATIENT_DISCHARGED',
      },
      ip: '127.0.0.1',
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

    await cancelBloodRequestHandler(mockReq, mockRes);
    expect(responseStatus).toBe(400);
    expect(responseData?.success).toBe(false);
    expect(responseData?.message).toContain('cannot be cancelled');
  });

  it('prevents marking a cancelled request as completed', async () => {
    let responseStatus = 0;
    let responseData: any = null;

    const mockReq = {
      user: {
        id: requesterId,
        email: 'requester@demo.bloodbridge.org',
        role: 'REQUESTER',
        fullName: 'Anita Requester',
      },
      params: { id: activeRequestId },
      body: { notes: 'Attempting to complete cancelled request' },
      ip: '127.0.0.1',
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

    await markBloodReceived(mockReq, mockRes);
    expect(responseStatus).toBe(400);
    expect(responseData?.success).toBe(false);
    expect(responseData?.message).toContain('Cannot complete a cancelled blood request');
  });
});
