import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { vaultService } from '../services/vault.service';
import { AuditLog } from '../models/AuditLog';

const router = Router();

// GET /api/monitoring/vault-health - Detailed Vault Health status
router.get(
  '/vault-health',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // 1. Check Vault health
      const health = await vaultService.getHealth();

      // 2. Check Token Validity
      const tokenInfo = await vaultService.verifyToken();

      // 3. Check Vault Audit Log file status
      const auditLogPath = 'd:/Vault_guard/vault/logs/vault_audit.log';
      let auditLogActive = false;
      let auditFileSize = 0;
      let auditLastUpdated: Date | null = null;

      try {
        if (fs.existsSync(auditLogPath)) {
          const stats = fs.statSync(auditLogPath);
          auditLogActive = stats.size > 0;
          auditFileSize = stats.size;
          auditLastUpdated = stats.mtime;
        }
      } catch (e) {
        // file check optional
      }

      // 4. Query recent retrieval failures from application audit logs
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [failedRetrievals, totalRetrievals] = await Promise.all([
        AuditLog.countDocuments({
          action: 'CREDENTIAL_RETRIEVAL_DENIED',
          timestamp: { $gte: twentyFourHoursAgo },
        }),
        AuditLog.countDocuments({
          action: { $in: ['CREDENTIAL_RETRIEVED', 'CREDENTIAL_RETRIEVAL_DENIED'] },
          timestamp: { $gte: twentyFourHoursAgo },
        }),
      ]);

      const retrievalFailureRate =
        totalRetrievals > 0 ? ((failedRetrievals / totalRetrievals) * 100).toFixed(1) : '0.0';

      res.status(200).json({
        success: true,
        monitoring: {
          timestamp: new Date(),
          vault: {
            status: health.statusText,
            initialized: health.initialized,
            sealed: health.sealed,
            standby: health.standby,
            version: health.version || '1.15.6 Community',
            clusterName: health.clusterName || 'vault-cluster-vg',
            statusCode: health.statusCode,
            lastChecked: health.lastChecked,
            details: health.details,
          },
          authentication: {
            valid: tokenInfo.valid,
            policies: tokenInfo.policies,
            ttlSeconds: tokenInfo.ttl,
          },
          auditLogging: {
            enabled: auditLogActive,
            logPath: auditLogPath,
            logSizeBytes: auditFileSize,
            lastLoggedAt: auditLastUpdated,
          },
          telemetry24h: {
            totalRetrievalAttempts: totalRetrievals,
            failedRetrievals,
            failureRatePercent: `${retrievalFailureRate}%`,
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve Vault health status',
        error: error.message,
      });
    }
  }
);

// GET /api/monitoring/events - System monitoring events
router.get(
  '/events',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const recentErrors = await AuditLog.find({
        result: { $in: ['FAILURE', 'DENIED'] },
      })
        .populate('accountId', 'accountName')
        .sort({ timestamp: -1 })
        .limit(20)
        .lean();

      res.status(200).json({
        success: true,
        events: recentErrors,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to retrieve monitoring events' });
    }
  }
);

export default router;

