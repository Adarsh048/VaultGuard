import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { vaultService } from '../services/vault.service';

const router = Router();

interface DependencyStatus {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  [key: string]: any;
}

/**
 * Liveness probe: verifies the Node.js/Express process is responsive.
 * Used by orchestrators to determine whether to restart the container/process.
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'UP',
    check: 'liveness',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'VaultGuard PAM API',
  });
});

/**
 * Readiness probe: checks core dependencies (MongoDB Atlas and HashiCorp Vault).
 * Used by load balancers and ingress to determine whether the service can accept traffic.
 */
router.get('/ready', async (req: Request, res: Response) => {
  const dependencies: Record<string, DependencyStatus> = {};
  let overallHealthy = true;

  // 1. Probe Database (MongoDB)
  const dbStart = Date.now();
  try {
    const isConnected = mongoose.connection.readyState === 1;
    if (!isConnected) {
      dependencies.database = {
        status: 'DOWN',
        connected: false,
        details: 'Database connection is not in ready state.',
      };
      overallHealthy = false;
    } else {
      // Execute lightweight ping
      await mongoose.connection.db?.command({ ping: 1 });
      const dbLatency = Date.now() - dbStart;
      dependencies.database = {
        status: 'UP',
        connected: true,
        latencyMs: dbLatency,
      };
    }
  } catch (dbErr: any) {
    // Sanitize error: never leak internal cluster topology or connection error strings
    dependencies.database = {
      status: 'DOWN',
      connected: false,
      details: 'Database service is currently unreachable or unresponsive.',
    };
    overallHealthy = false;
  }

  // 2. Probe Secrets Engine (HashiCorp Vault)
  const vaultStart = Date.now();
  try {
    const vaultHealth = await vaultService.getHealth();
    const vaultLatency = Date.now() - vaultStart;

    if (vaultHealth.statusText === 'Healthy') {
      // Omit software version from unauthenticated health endpoints to prevent CVE fingerprinting
      dependencies.vault = {
        status: 'UP',
        initialized: vaultHealth.initialized,
        sealed: vaultHealth.sealed,
        standby: vaultHealth.standby,
        latencyMs: vaultLatency,
      };
    } else if (vaultHealth.statusText === 'Warning') {
      dependencies.vault = {
        status: 'DEGRADED',
        initialized: vaultHealth.initialized,
        sealed: vaultHealth.sealed,
        standby: vaultHealth.standby,
        details: 'Vault is sealed or in standby mode.',
        latencyMs: vaultLatency,
      };
      overallHealthy = false;
    } else {
      dependencies.vault = {
        status: 'DOWN',
        initialized: vaultHealth.initialized,
        sealed: vaultHealth.sealed,
        details: 'Vault secrets service is currently unreachable.',
        latencyMs: vaultLatency,
      };
      overallHealthy = false;
    }
  } catch (vaultErr: any) {
    // Sanitize error: never leak internal Vault addresses or stack traces
    dependencies.vault = {
      status: 'DOWN',
      details: 'Failed to communicate with Vault secrets service.',
    };
    overallHealthy = false;
  }

  const statusCode = overallHealthy ? 200 : 503;
  return res.status(statusCode).json({
    status: overallHealthy ? 'UP' : 'DOWN',
    check: 'readiness',
    timestamp: new Date().toISOString(),
    service: 'VaultGuard PAM API',
    dependencies,
  });
});

/**
 * Standard health endpoint:
 * Defaults to readiness probe unless explicitly requested with ?type=live.
 * Ensures external monitoring alerts honestly if dependencies fail.
 */
router.get('/', (req: Request, res: Response, next) => {
  if (req.query.type === 'live') {
    return res.status(200).json({
      status: 'UP',
      check: 'liveness',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      service: 'VaultGuard PAM API',
    });
  }
  // Forward to readiness probe logic
  const readyHandler = router.stack.find((layer) => layer.route?.path === '/ready')?.route?.stack[0]?.handle;
  if (readyHandler) {
    return readyHandler(req, res, next);
  }
  res.status(200).json({ status: 'UP', service: 'VaultGuard PAM API' });
});

export default router;

