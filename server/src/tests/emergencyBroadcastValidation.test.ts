import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { prisma } from '../prisma';
import { config } from '../config';
import { resetBroadcastStore } from '../services/emergencyBroadcastService';

describe('Emergency Broadcast Validation, Real-Time Dispatch & Revocation Guards', () => {
  let adminToken: string;
  let donorToken: string;

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const donor = await prisma.user.findFirst({ where: { role: 'DONOR' } });

    if (!admin || !donor) {
      throw new Error('Seed database must contain admin and donor accounts.');
    }

    adminToken = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, config.jwtSecret, { expiresIn: '1h' });
    donorToken = jwt.sign({ id: donor.id, email: donor.email, role: donor.role }, config.jwtSecret, { expiresIn: '1h' });
  });

  beforeEach(() => {
    resetBroadcastStore();
  });

  describe('issueBroadcastHandler input validation and role defense', () => {
    it('rejects unauthenticated broadcast issuance with 401', async () => {
      const res = await request(app).post('/api/broadcasts').send({
        level: 'LEVEL_2_METRO_ALERT',
        title: 'Multi-Casualty Metro Incident',
        incidentDescription: 'Bus crash on highway require O- units',
        affectedRegion: 'Metro North Corridor',
      });

      expect(res.status).toBe(401);
    });

    it('returns 403 Forbidden when a voluntary donor attempts to issue a broadcast', async () => {
      const res = await request(app)
        .post('/api/broadcasts')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          level: 'LEVEL_2_METRO_ALERT',
          title: 'Unauthorized Alert',
          incidentDescription: 'Test',
          affectedRegion: 'District 1',
        });

      expect(res.status).toBe(403);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/broadcasts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          level: 'LEVEL_1_FACILITY_URGENT',
          // missing title, incidentDescription, affectedRegion
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required broadcast fields');
    });

    it('returns 400 when an invalid broadcast level is supplied', async () => {
      const res = await request(app)
        .post('/api/broadcasts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          level: 'INVALID_SUPER_CRITICAL_LEVEL',
          title: 'Train Derailment',
          incidentDescription: 'Multiple trauma admissions at Apollo',
          affectedRegion: 'Central Metro',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid emergency broadcast level');
    });

    it('returns 400 when durationHours is less than 1 or exceeds 168 hours', async () => {
      const resLow = await request(app)
        .post('/api/broadcasts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          level: 'LEVEL_2_METRO_ALERT',
          title: 'Subway Incident',
          incidentDescription: 'Multiple casualties',
          affectedRegion: 'City Center',
          durationHours: 0,
        });

      expect(resLow.status).toBe(400);
      expect(resLow.body.error).toContain('between 1 and 168');

      const resHigh = await request(app)
        .post('/api/broadcasts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          level: 'LEVEL_2_METRO_ALERT',
          title: 'Subway Incident',
          incidentDescription: 'Multiple casualties',
          affectedRegion: 'City Center',
          durationHours: 500,
        });

      expect(resHigh.status).toBe(400);
      expect(resHigh.body.error).toContain('between 1 and 168');
    });

    it('successfully dispatches a valid regional emergency broadcast (201 Created)', async () => {
      const res = await request(app)
        .post('/api/broadcasts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          level: 'LEVEL_2_METRO_ALERT',
          title: 'Metro Highway Pileup Trauma Alert',
          incidentDescription: 'Severe highway accident with 15 trauma patients admitted.',
          affectedRegion: 'Sector 4 North Bypass',
          targetBloodGroups: ['O-', 'A-'],
          durationHours: 12,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.level).toBe('LEVEL_2_METRO_ALERT');
      expect(res.body.data.targetBloodGroups).toEqual(['O-', 'A-']);
      expect(res.body.data.isActive).toBe(true);
    });
  });

  describe('getActiveBroadcastsHandler and revokeBroadcastHandler', () => {
    it('returns active broadcasts via public GET endpoint', async () => {
      // Issue a broadcast first
      const issueRes = await request(app)
        .post('/api/broadcasts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          level: 'LEVEL_3_REGIONAL_DISASTER',
          title: 'Coastal Cyclone Trauma Preparedness',
          incidentDescription: 'Coastal hospitals requesting O- and B- reserve restock.',
          affectedRegion: 'Southern Coastal District',
          targetBloodGroups: ['O-', 'B-'],
          durationHours: 24,
        });

      const bcastId = issueRes.body.data.id;

      const activeRes = await request(app).get('/api/broadcasts/active');
      expect(activeRes.status).toBe(200);
      expect(activeRes.body.success).toBe(true);
      expect(activeRes.body.data.some((b: any) => b.id === bcastId)).toBe(true);
    });

    it('returns 404 when revoking a non-existent broadcast', async () => {
      const res = await request(app)
        .post('/api/broadcasts/non_existent_broadcast_id/revoke')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('successfully revokes an active broadcast alert', async () => {
      const issueRes = await request(app)
        .post('/api/broadcasts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          level: 'LEVEL_1_FACILITY_URGENT',
          title: 'Facility Blood Stock Critical',
          incidentDescription: 'Apollo Emergency ICU requires 4 units O-',
          affectedRegion: 'Apollo Main Campus',
          targetBloodGroups: ['O-'],
          durationHours: 4,
        });

      const bcastId = issueRes.body.data.id;

      const revokeRes = await request(app)
        .post(`/api/broadcasts/${bcastId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // Verify it is no longer returned in active list
      const activeRes = await request(app).get('/api/broadcasts/active');
      expect(activeRes.body.data.some((b: any) => b.id === bcastId)).toBe(false);
    });
  });
});
