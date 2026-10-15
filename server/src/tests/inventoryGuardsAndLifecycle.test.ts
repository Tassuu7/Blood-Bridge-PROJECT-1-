import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { resetInventoryStore } from '../services/inventoryService';

describe('Hospital Inventory Anti-Tampering & Lifecycle Guards Integration Tests', () => {
  let hospitalToken: string;
  let adminToken: string;
  let donorToken: string;
  let requesterToken: string;
  let hospitalProfileId: string;
  let hospitalUserId: string;

  beforeAll(async () => {
    // Retrieve seeded demo accounts
    const hospitalUser = await prisma.user.findFirst({
      where: { role: 'HOSPITAL' },
      include: { hospitalProfile: true },
    });
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const donorUser = await prisma.user.findFirst({ where: { role: 'DONOR' } });
    const requesterUser = await prisma.user.findFirst({ where: { role: 'REQUESTER' } });

    if (!hospitalUser || !hospitalUser.hospitalProfile || !adminUser || !donorUser || !requesterUser) {
      throw new Error('Required demo seed accounts missing from database.');
    }

    hospitalProfileId = hospitalUser.hospitalProfile.id;
    hospitalUserId = hospitalUser.id;

    hospitalToken = jwt.sign(
      { id: hospitalUser.id, email: hospitalUser.email, role: hospitalUser.role },
      config.jwtSecret,
      { expiresIn: '2h' }
    );

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role },
      config.jwtSecret,
      { expiresIn: '2h' }
    );

    donorToken = jwt.sign(
      { id: donorUser.id, email: donorUser.email, role: donorUser.role },
      config.jwtSecret,
      { expiresIn: '2h' }
    );

    requesterToken = jwt.sign(
      { id: requesterUser.id, email: requesterUser.email, role: requesterUser.role },
      config.jwtSecret,
      { expiresIn: '2h' }
    );
  });

  beforeEach(() => {
    resetInventoryStore();
  });

  describe('Authentication & Role-Based Access Guards', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject access with 403 when requested by a DONOR', async () => {
      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${donorToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject access with 403 when requested by a REQUESTER', async () => {
      const res = await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ bloodGroup: 'O-', units: 5 });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/inventory - Tenancy & Category Retrieval', () => {
    it('should return complete 8-group inventory for authenticated hospital user', async () => {
      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inventory).toBeDefined();
      expect(res.body.data.inventory.length).toBe(8);
      expect(Array.isArray(res.body.data.lowStockAlerts)).toBe(true);
    });

    it('should allow platform admin to query inventory for a specific facility', async () => {
      const res = await request(app)
        .get(`/api/inventory?hospitalId=${hospitalProfileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inventory.length).toBe(8);
    });
  });

  describe('POST /api/inventory/restock - Payload Sanitization & Anti-Tampering', () => {
    it('should reject restock with invalid or unsupported blood group', async () => {
      const res = await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'INVALID_GROUP', units: 5 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid blood group');
    });

    it('should reject non-positive units (zero and negative counts)', async () => {
      const zeroRes = await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A+', units: 0 });

      expect(zeroRes.status).toBe(400);
      expect(zeroRes.body.error).toContain('positive whole integer');

      const negRes = await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A+', units: -4 });

      expect(negRes.status).toBe(400);
      expect(negRes.body.error).toContain('positive whole integer');
    });

    it('should reject fractional / floating point blood unit amounts', async () => {
      const res = await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'B+', units: 3.5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('positive whole integer');
    });

    it('should reject excessive batch quantities exceeding 500 units', async () => {
      const res = await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'O+', units: 999 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('maximum allowed limit');
    });

    it('should reject out-of-range shelf-life day values', async () => {
      const res = await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'O+', units: 10, shelfLifeDays: 999 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Shelf life days must be an integer between 1 and 60');
    });

    it('should successfully restock valid blood batch and adjust available balance', async () => {
      const res = await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodGroup: 'O-',
          units: 12,
          shelfLifeDays: 42,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newTotal).toBe(12);
      expect(res.body.data.batch.batchNumber).toContain('O-');
      expect(res.body.data.batch.units).toBe(12);
    });
  });

  describe('Reservation, Release, and Dispense Lifecycle', () => {
    beforeEach(async () => {
      // Seed 10 units of A- before lifecycle tests
      await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A-', units: 10 });
    });

    it('should reject reservation exceeding available inventory with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/inventory/reserve')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A-', units: 15 });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Insufficient available units');
    });

    it('should successfully reserve units for an emergency admission', async () => {
      const res = await request(app)
        .post('/api/inventory/reserve')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A-', units: 4 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unitsReserved).toBe(4);
      expect(res.body.data.remainingAvailable).toBe(6);
    });

    it('should release reserved units back to available stock if request is cancelled', async () => {
      // First reserve 4 units
      await request(app)
        .post('/api/inventory/reserve')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A-', units: 4 });

      // Release 2 units
      const releaseRes = await request(app)
        .post('/api/inventory/release')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A-', units: 2 });

      expect(releaseRes.status).toBe(200);
      expect(releaseRes.body.success).toBe(true);

      // Verify available units increased from 6 to 8
      const invRes = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${hospitalToken}`);

      const aNeg = invRes.body.data.inventory.find((i: any) => i.bloodGroup === 'A-');
      expect(aNeg.totalAvailable).toBe(8);
      expect(aNeg.totalReserved).toBe(2);
    });

    it('should reject dispensing more units than currently reserved', async () => {
      // Currently 0 units reserved
      const res = await request(app)
        .post('/api/inventory/dispense')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A-', units: 2 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Cannot dispense more than reserved units');
    });

    it('should successfully dispense reserved units for clinical transfusion', async () => {
      // Reserve 3 units
      await request(app)
        .post('/api/inventory/reserve')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A-', units: 3 });

      // Dispense 2 units
      const dispenseRes = await request(app)
        .post('/api/inventory/dispense')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodGroup: 'A-', units: 2 });

      expect(dispenseRes.status).toBe(200);
      expect(dispenseRes.body.success).toBe(true);

      // Check remaining reserved count
      const invRes = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${hospitalToken}`);

      const aNeg = invRes.body.data.inventory.find((i: any) => i.bloodGroup === 'A-');
      expect(aNeg.totalReserved).toBe(1);
      expect(aNeg.totalAvailable).toBe(7);
    });
  });

  describe('Tenancy Isolation Enforcement', () => {
    it('should prevent hospital user from tampering with other facilities by ignoring spoofed hospitalId parameter', async () => {
      // Authenticated hospital attempts to pass spoofed hospitalId
      const res = await request(app)
        .post('/api/inventory/restock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          hospitalId: 'malicious_target_hospital_999',
          bloodGroup: 'AB-',
          units: 5,
        });

      expect(res.status).toBe(201);
      // The restock must be applied to the authenticated hospital's own inventory
      const ownInv = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${hospitalToken}`);

      const abNeg = ownInv.body.data.inventory.find((i: any) => i.bloodGroup === 'AB-');
      expect(abNeg.totalAvailable).toBe(5);

      // The malicious target hospital must have 0
      const adminCheck = await request(app)
        .get('/api/inventory?hospitalId=malicious_target_hospital_999')
        .set('Authorization', `Bearer ${adminToken}`);

      const spoofedAbNeg = adminCheck.body.data.inventory.find((i: any) => i.bloodGroup === 'AB-');
      expect(spoofedAbNeg.totalAvailable).toBe(0);
    });
  });
});
