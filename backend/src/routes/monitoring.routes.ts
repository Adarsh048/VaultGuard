import { Router, Response } from 'express';
import fs from 'fs';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { vaultService } from '../services/vault.service';
import { AuditLog } from '../models/AuditLog';
import { config } from '../config/env';

const router = Router();

// GET /api/monitoring/vault-health - Detailed Vault Health status
router.get(
  '/vault-health',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // 1. Live health check against HashiCorp Vault sys/health
      const health = await vaultService.getHealth();

      // 2. Token validity and least-privilege policy verification
      const tokenInfo = await vaultService.verifyToken();

      // 3. Environment-configurable audit log verification
      const auditLogPath = config.vaultAuditLogPath;
      let auditLogStatus: 'Healthy' | 'Warning' | 'Unavailable' | 'Not Configured' = 'Not Configured';
      let auditFileSize = 0;
      let auditLastUpdated: Date | null = null;
      let auditFileError: string | null = null;

      if (!auditLogPath) {
        auditLogStatus = 'Not Configured';
      } else {
        try {
          if (fs.existsSync(auditLogPath)) {
            const stats = fs.statSync(auditLogPath);
            auditFileSize = stats.size;
            auditLastUpdated = stats.mtime;
            auditLogStatus = stats.size > 0 ? 'Healthy' : 'Warning';
          } else {
            auditLogStatus = 'Unavailable';
            auditFileError = 'Audit log file does not exist at configured path.';
          }
        } catch (e: any) {
          auditLogStatus = 'Unavailable';
          auditFileError = e.message || 'Permission or path access error.';
        }
      }

      // 4. Real telemetry: Count actual retrieval denials and checkouts from the audit ledger
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
            version: health.version || null,
            clusterName: health.clusterName || null,
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
            status: auditLogStatus,
            configuredPath: auditLogPath,
            logSizeBytes: auditFileSize,
            lastLoggedAt: auditLastUpdated,
            error: auditFileError,
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

// GET /api/monitoring/events - System monitoring events (denials and failures)
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
        .sort({ sequenceNumber: -1 })
        .limit(25)
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
