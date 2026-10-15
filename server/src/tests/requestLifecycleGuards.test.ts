import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { prisma } from '../prisma';
import { config } from '../config';
import { escalateRequest } from '../services/escalationService';

describe('Request Lifecycle & Authorization Guards (markBloodReceived & triggerManualEscalation)', () => {
  let requesterToken: string;
  let requesterUserId: string;
  let hospitalToken: string;
  let hospitalProfileId: string;
  let otherHospitalToken: string;
  let donorToken: string;
  let adminToken: string;

  let pendingRequestId: string;
  let activeRequestId: string;
  let completedRequestId: string;
  let cancelledRequestId: string;

  beforeAll(async () => {
    // Look up or prepare test entities
    const requester = await prisma.user.findFirst({ where: { role: 'REQUESTER' } });
    const hospital = await prisma.hospitalProfile.findFirst({ include: { user: true } });
    const donor = await prisma.donorProfile.findFirst({ include: { user: true } });
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

    if (!requester || !hospital || !donor || !admin) {
      throw new Error('Database must be seeded with demo users before running lifecycle guard tests.');
    }

    requesterUserId = requester.id;
    hospitalProfileId = hospital.id;

    // Create a secondary hospital user to test scoping/unauthorized hospital access
    let otherHospitalUser = await prisma.user.findUnique({ where: { email: 'other.hospital@demo.bloodbridge.org' } });
    let otherHospitalProfile;
    if (!otherHospitalUser) {
      otherHospitalUser = await prisma.user.create({
        data: {
          email: 'other.hospital@demo.bloodbridge.org',
          fullName: 'Secondary General Hospital Staff',
          passwordHash: 'dummy_hash',
          role: 'HOSPITAL',
          status: 'ACTIVE',
        },
      });
      otherHospitalProfile = await prisma.hospitalProfile.create({
        data: {
          userId: otherHospitalUser.id,
          hospitalName: 'Secondary General Hospital',
          licenseNumber: 'LIC-SEC-998877',
          address: 'North District Hospital Ave',
          contactNumber: '+91-9988776655',
          isVerified: true,
        },
      });
    } else {
      otherHospitalProfile = await prisma.hospitalProfile.findUnique({ where: { userId: otherHospitalUser.id } });
    }

    requesterToken = jwt.sign({ id: requester.id, email: requester.email, role: requester.role }, config.jwtSecret, { expiresIn: '1h' });
    hospitalToken = jwt.sign({ id: hospital.user.id, email: hospital.user.email, role: hospital.user.role }, config.jwtSecret, { expiresIn: '1h' });
    otherHospitalToken = jwt.sign({ id: otherHospitalUser.id, email: otherHospitalUser.email, role: otherHospitalUser.role }, config.jwtSecret, { expiresIn: '1h' });
    donorToken = jwt.sign({ id: donor.user.id, email: donor.user.email, role: donor.user.role }, config.jwtSecret, { expiresIn: '1h' });
    adminToken = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, config.jwtSecret, { expiresIn: '1h' });

    const timestamp = Date.now().toString().slice(-5);

    // 1. Pending verification request
    const pReq = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-GUARD-P-${timestamp}`,
        requesterId: requesterUserId,
        hospitalId: hospitalProfileId,
        patientInitials: 'T.P.',
        bloodGroup: 'O+',
        unitsRequired: 1,
        urgency: 'URGENT',
        status: 'PENDING_VERIFICATION',
        requiredBy: new Date(Date.now() + 4 * 3600 * 1000),
      },
    });
    pendingRequestId = pReq.id;

    // 2. Active verified request (DONORS_NOTIFIED)
    const aReq = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-GUARD-A-${timestamp}`,
        requesterId: requesterUserId,
        hospitalId: hospitalProfileId,
        patientInitials: 'T.A.',
        bloodGroup: 'A+',
        unitsRequired: 2,
        urgency: 'URGENT',
        status: 'DONORS_NOTIFIED',
        requiredBy: new Date(Date.now() + 6 * 3600 * 1000),
      },
    });
    activeRequestId = aReq.id;

    // 3. Already completed request
    const cReq = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-GUARD-C-${timestamp}`,
        requesterId: requesterUserId,
        hospitalId: hospitalProfileId,
        patientInitials: 'T.C.',
        bloodGroup: 'B+',
        unitsRequired: 1,
        urgency: 'NORMAL',
        status: 'COMPLETED',
        requiredBy: new Date(Date.now() + 12 * 3600 * 1000),
      },
    });
    completedRequestId = cReq.id;

    // 4. Cancelled request
    const xReq = await prisma.bloodRequest.create({
      data: {
        id: `BB-TEST-GUARD-X-${timestamp}`,
        requesterId: requesterUserId,
        hospitalId: hospitalProfileId,
        patientInitials: 'T.X.',
        bloodGroup: 'AB+',
        unitsRequired: 1,
        urgency: 'NORMAL',
        status: 'CANCELLED',
        requiredBy: new Date(Date.now() + 8 * 3600 * 1000),
      },
    });
    cancelledRequestId = xReq.id;
  });

  describe('markBloodReceived endpoint guards (/api/requests/:id/complete)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).post(`/api/requests/${activeRequestId}/complete`).send({ notes: 'Done' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 if the request ID does not exist', async () => {
      const res = await request(app)
        .post('/api/requests/BB-NON-EXISTENT-9999/complete')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ notes: 'Done' });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 Forbidden when a voluntary donor attempts to mark blood received', async () => {
      const res = await request(app)
        .post(`/api/requests/${activeRequestId}/complete`)
        .set('Authorization', `Bearer ${donorToken}`)
        .send({ notes: 'Attempting donor bypass' });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unauthorized');
    });

    it('returns 403 Forbidden when an unrelated hospital attempts to complete another hospital request', async () => {
      const res = await request(app)
        .post(`/api/requests/${activeRequestId}/complete`)
        .set('Authorization', `Bearer ${otherHospitalToken}`)
        .send({ notes: 'Hospital cross-tenant attempt' });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unauthorized');
    });

    it('returns 400 Bad Request if request is still PENDING_VERIFICATION', async () => {
      const res = await request(app)
        .post(`/api/requests/${pendingRequestId}/complete`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ notes: 'premature complete' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('pending hospital verification');
    });

    it('returns 400 Bad Request if request is already COMPLETED', async () => {
      const res = await request(app)
        .post(`/api/requests/${completedRequestId}/complete`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ notes: 'duplicate complete' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already completed');
    });

    it('returns 400 Bad Request if request is CANCELLED', async () => {
      const res = await request(app)
        .post(`/api/requests/${cancelledRequestId}/complete`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ notes: 'cancelled complete' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('cancelled');
    });

    it('successfully completes active request when called by assigned hospital', async () => {
      const res = await request(app)
        .post(`/api/requests/${activeRequestId}/complete`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ notes: 'Units safely transfused.' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.request.status).toBe('COMPLETED');
    });
  });

  describe('triggerManualEscalation endpoint guards (/api/requests/:id/escalate)', () => {
    it('rejects unauthenticated escalation with 401', async () => {
      const res = await request(app).post(`/api/requests/${pendingRequestId}/escalate`).send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 if request is not found', async () => {
      const res = await request(app)
        .post('/api/requests/BB-NON-EXISTENT-8888/escalate')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 Forbidden when an unauthorized donor attempts escalation', async () => {
      const res = await request(app)
        .post(`/api/requests/${pendingRequestId}/escalate`)
        .set('Authorization', `Bearer ${donorToken}`)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unauthorized');
    });

    it('returns 400 when attempting to escalate a request that is still PENDING_VERIFICATION', async () => {
      const res = await request(app)
        .post(`/api/requests/${pendingRequestId}/escalate`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('must be verified by hospital');
    });

    it('returns 400 when attempting to escalate a CANCELLED request', async () => {
      const res = await request(app)
        .post(`/api/requests/${cancelledRequestId}/escalate`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('cannot be escalated');
    });

    it('returns 400 when attempting to escalate a COMPLETED request', async () => {
      const res = await request(app)
        .post(`/api/requests/${completedRequestId}/escalate`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('cannot be escalated');
    });
  });

  describe('escalationService service-level guards', () => {
    it('gracefully refuses escalation when request is CANCELLED', async () => {
      const result = await escalateRequest(cancelledRequestId);
      expect(result.success).toBe(false);
      expect(result.message).toContain('no escalation permitted');
    });

    it('gracefully refuses escalation when request is PENDING_VERIFICATION', async () => {
      const result = await escalateRequest(pendingRequestId);
      expect(result.success).toBe(false);
      expect(result.message).toContain('no escalation permitted');
    });
  });
});
