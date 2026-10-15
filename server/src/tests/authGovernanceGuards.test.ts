import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { prisma } from '../prisma';
import { config } from '../config';

describe('Authentication & Governance Privilege Guards', () => {
  let adminToken: string;
  let adminUserId: string;
  let testTargetUserId: string;

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      throw new Error('Database must be seeded with an admin user.');
    }
    adminUserId = admin.id;
    adminToken = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, config.jwtSecret, { expiresIn: '1h' });

    // Create a target non-admin user for status toggling tests
    const timestamp = Date.now().toString().slice(-5);
    const target = await prisma.user.create({
      data: {
        email: `target.user.${timestamp}@demo.bloodbridge.org`,
        fullName: 'Target Governance User',
        passwordHash: 'dummy_hash',
        role: 'DONOR',
        status: 'ACTIVE',
      },
    });
    testTargetUserId = target.id;
  });

  describe('Public Registration Privilege Escalation Guards (/api/auth/register)', () => {
    const timestamp = Date.now().toString().slice(-4);

    it('rejects unauthenticated public self-registration with ADMIN role (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `rogue.admin.${timestamp}@malicious.org`,
          password: 'Password123!',
          fullName: 'Rogue Admin Attempt',
          role: 'ADMIN',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('restricted');
    });

    it('rejects registration with ADMIN role when an invalid secret key is provided', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `rogue.admin2.${timestamp}@malicious.org`,
          password: 'Password123!',
          fullName: 'Rogue Admin Attempt 2',
          role: 'ADMIN',
          adminSecretKey: 'wrong_secret_passphrase',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('restricted');
    });

    it('allows ADMIN registration when the correct provisioning secret key is supplied', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `authorized.admin.${timestamp}@bloodbridge.org`,
          password: 'Password123!',
          fullName: 'Authorized Operations Admin',
          role: 'ADMIN',
          adminSecretKey: 'bloodbridge_admin_init_secret_2026',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('ADMIN');
    });

    it('allows standard public registration for DONOR and REQUESTER roles without secret key', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `valid.donor.${timestamp}@community.org`,
          password: 'Password123!',
          fullName: 'Public Community Donor',
          role: 'DONOR',
          bloodGroup: 'O+',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('DONOR');
    });
  });

  describe('Admin User Governance & Lockout Defense (/api/admin/users/:userId/status)', () => {
    it('returns 404 when attempting to update status of a non-existent user ID', async () => {
      const res = await request(app)
        .patch('/api/admin/users/non-existent-user-id-9999/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('User not found');
    });

    it('rejects invalid status values with 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${testTargetUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('ACTIVE or SUSPENDED');
    });

    it('forbids administrators from suspending their own active account', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${adminUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Administrators cannot suspend their own active account');
    });

    it('allows an administrator to suspend a targeted non-admin user', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${testTargetUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.status).toBe('SUSPENDED');
    });

    it('allows an administrator to re-activate a suspended user', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${testTargetUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.status).toBe('ACTIVE');
    });
  });
});
