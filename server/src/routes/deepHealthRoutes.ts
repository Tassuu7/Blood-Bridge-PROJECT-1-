/**
 * BloodBridge Deep System Diagnostics, Telemetry & Health Probe Routes
 * Provides Kubernetes / Docker-compatible liveness, readiness, and deep diagnostic probes
 * for high-availability blood coordination infrastructure.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { getTelemetrySnapshot } from '../services/telemetryService';

export const deepHealthRoutes = Router();

/**
 * Measures Node.js event loop lag in milliseconds
 */
export function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = Date.now();
    setImmediate(() => {
      resolve(Date.now() - start);
    });
  });
}

/**
 * Validates database connection liveness with timeout protection
 */
export async function checkDatabaseLiveness(
  timeoutMs: number = 3000
): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const queryPromise = prisma.$queryRaw`SELECT 1`;
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Database query timed out')), timeoutMs);
    });

    await Promise.race([queryPromise, timeoutPromise]);
    clearTimeout(timer!);
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err.message || 'Unknown database connectivity error',
    };
  }
}

/**
 * Evaluates process memory thresholds
 */
export function evaluateMemoryHealth(): {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  heapUtilizationPercent: number;
} {
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
  const heapUtilizationPercent =
    heapTotalMb > 0 ? Math.round((mem.heapUsed / mem.heapTotal) * 100) : 0;

  let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
  if (heapUsedMb > 1024 || heapUtilizationPercent > 92) {
    status = 'CRITICAL';
  } else if (heapUsedMb > 512 || heapUtilizationPercent > 85) {
    status = 'WARNING';
  }

  return { status, rssMb, heapUsedMb, heapTotalMb, heapUtilizationPercent };
}

/**
 * Liveness Probe: Quick check if the process is alive
 * Returns 200 OK immediately.
 */
deepHealthRoutes.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid,
  });
});

/**
 * Readiness Probe: Checks whether the service is ready to handle incoming traffic
 * Verifies database connection, event loop lag, and memory pressure.
 */
deepHealthRoutes.get('/ready', async (_req: Request, res: Response) => {
  const [dbCheck, eventLoopLagMs] = await Promise.all([
    checkDatabaseLiveness(),
    measureEventLoopLag(),
  ]);

  const memory = evaluateMemoryHealth();
  const isReady = dbCheck.healthy && memory.status !== 'CRITICAL' && eventLoopLagMs < 500;

  const checks = {
    database: {
      status: dbCheck.healthy ? 'UP' : 'DOWN',
      latencyMs: dbCheck.latencyMs,
      ...(dbCheck.error ? { error: dbCheck.error } : {}),
    },
    eventLoop: {
      status: eventLoopLagMs < 250 ? 'UP' : eventLoopLagMs < 500 ? 'DEGRADED' : 'DOWN',
      lagMs: eventLoopLagMs,
    },
    memory: {
      status: memory.status === 'CRITICAL' ? 'DOWN' : memory.status === 'WARNING' ? 'DEGRADED' : 'UP',
      heapUsedMb: memory.heapUsedMb,
      heapUtilizationPercent: memory.heapUtilizationPercent,
    },
  };

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'READY' : 'NOT_READY',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * Deep Diagnostics: Comprehensive diagnostic snapshot of system health,
 * process metrics, database latency, and operational telemetry.
 */
deepHealthRoutes.get('/deep', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  const [dbCheck, eventLoopLagMs] = await Promise.all([
    checkDatabaseLiveness(),
    measureEventLoopLag(),
  ]);

  const memory = evaluateMemoryHealth();
  const telemetry = getTelemetrySnapshot();
  const cpu = process.cpuUsage();

  const isHealthy = dbCheck.healthy && memory.status !== 'CRITICAL';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    process: {
      uptimeSeconds: Math.floor(process.uptime()),
      pid: process.pid,
      nodeVersion: process.version,
      cpu: {
        userMicroseconds: cpu.user,
        systemMicroseconds: cpu.system,
      },
      memory: {
        status: memory.status,
        rssMb: memory.rssMb,
        heapUsedMb: memory.heapUsedMb,
        heapTotalMb: memory.heapTotalMb,
        heapUtilizationPercent: memory.heapUtilizationPercent,
      },
      eventLoopLagMs,
    },
    services: {
      database: {
        status: dbCheck.healthy ? 'HEALTHY' : 'DEGRADED',
        latencyMs: dbCheck.latencyMs,
        ...(dbCheck.error ? { error: dbCheck.error } : {}),
      },
      telemetry: {
        activeSockets: telemetry.activeSocketConnections,
        totalRequestsDispatched: telemetry.totalEmergencyRequestsDispatched,
        fulfillmentRatePercent: telemetry.fulfillmentSuccessRatePercent,
        averageMatchingLatencyMs: telemetry.averageMatchingLatencyMs,
      },
    },
    totalDiagnosticTimeMs: Date.now() - startTime,
  });
});
