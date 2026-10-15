import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../prisma';
import {
  measureEventLoopLag,
  checkDatabaseLiveness,
  evaluateMemoryHealth,
} from '../routes/deepHealthRoutes';

describe('Deep Health, Liveness & Readiness Probes Integration Tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/health - Baseline API Health', () => {
    it('should return 200 with platform baseline information', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toContain('BloodBridge');
      expect(res.body.version).toBe('1.0.0');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/health/live - Liveness Probe', () => {
    it('should return 200 UP with uptime and process PID', async () => {
      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
      expect(typeof res.body.uptimeSeconds).toBe('number');
      expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(typeof res.body.pid).toBe('number');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/health/ready - Readiness Probe', () => {
    it('should return 200 READY with database, event loop, and memory checks under normal operation', async () => {
      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database.status).toBe('UP');
      expect(typeof res.body.checks.database.latencyMs).toBe('number');
      expect(res.body.checks.eventLoop.status).toBe('UP');
      expect(typeof res.body.checks.eventLoop.lagMs).toBe('number');
      expect(['UP', 'DEGRADED']).toContain(res.body.checks.memory.status);
    });

    it('should return 503 NOT_READY when database query fails', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(
        new Error('SQLITE_BUSY: database is locked')
      );

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('NOT_READY');
      expect(res.body.checks.database.status).toBe('DOWN');
      expect(res.body.checks.database.error).toContain('SQLITE_BUSY');
    });
  });

  describe('GET /api/health/deep - Comprehensive Diagnostics', () => {
    it('should return 200 HEALTHY with telemetry, CPU, memory, and database metrics', async () => {
      const res = await request(app).get('/api/health/deep');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('HEALTHY');
      expect(res.body.process).toBeDefined();
      expect(res.body.process.cpu).toBeDefined();
      expect(typeof res.body.process.cpu.userMicroseconds).toBe('number');
      expect(res.body.process.memory).toBeDefined();
      expect(typeof res.body.process.memory.rssMb).toBe('number');
      expect(typeof res.body.process.memory.heapUsedMb).toBe('number');
      expect(typeof res.body.process.eventLoopLagMs).toBe('number');
      expect(res.body.services.database.status).toBe('HEALTHY');
      expect(typeof res.body.services.database.latencyMs).toBe('number');
      expect(res.body.services.telemetry).toBeDefined();
      expect(typeof res.body.totalDiagnosticTimeMs).toBe('number');
    });

    it('should return 503 DEGRADED when database check fails in deep diagnostic', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(
        new Error('Connection pool exhausted')
      );

      const res = await request(app).get('/api/health/deep');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('DEGRADED');
      expect(res.body.services.database.status).toBe('DEGRADED');
      expect(res.body.services.database.error).toContain('Connection pool exhausted');
    });
  });

  describe('Diagnostic Utility Functions', () => {
    it('should measure event loop lag as a non-negative number', async () => {
      const lag = await measureEventLoopLag();
      expect(typeof lag).toBe('number');
      expect(lag).toBeGreaterThanOrEqual(0);
    });

    it('should evaluate memory health and return valid status and utilization', () => {
      const memory = evaluateMemoryHealth();
      expect(['HEALTHY', 'WARNING', 'CRITICAL']).toContain(memory.status);
      expect(memory.rssMb).toBeGreaterThan(0);
      expect(memory.heapUsedMb).toBeGreaterThan(0);
      expect(memory.heapTotalMb).toBeGreaterThan(0);
      expect(memory.heapUtilizationPercent).toBeGreaterThanOrEqual(0);
      expect(memory.heapUtilizationPercent).toBeLessThanOrEqual(100);
    });

    it('should handle database timeout in checkDatabaseLiveness gracefully', async () => {
      // Mock an unresolved promise to trigger timeout
      vi.spyOn(prisma, '$queryRaw').mockImplementation(
        () => new Promise(() => {}) // never resolves
      );

      const result = await checkDatabaseLiveness(50); // 50ms fast timeout
      expect(result.healthy).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });
});
