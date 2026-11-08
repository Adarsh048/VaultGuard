import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { credentialRetrievalLimiter } from '../middlewares/rateLimiter';
import { PrivilegedAccount } from '../models/PrivilegedAccount';
import { AccessGrant } from '../models/AccessGrant';
import { vaultService } from '../services/vault.service';
import { auditService } from '../services/audit.service';
import { incidentService } from '../services/incident.service';

const router = Router();

// POST /api/accounts/:id/retrieve - Retrieve privileged credential
router.post(
  '/:id/retrieve',
  authenticate,
  credentialRetrievalLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const accountId = req.params.id;

    try {
      const account = await PrivilegedAccount.findById(accountId);
      if (!account) {
        res.status(404).json({ success: false, message: 'Privileged account not found' });
        return;
      }

      let grantExpiryDate: Date | null = null;

      // Access Control Verification
      if (user.role !== 'ADMIN') {
        // Find most recent grant for this user and account
        const grant = await AccessGrant.findOne({
          userId: user._id,
          accountId: account._id,
        }).sort({ createdAt: -1 });

        const now = new Date();

        if (!grant) {
          // Denied: No grant exists
          await auditService.log({
            userId: user._id,
            username: user.name,
            action: 'CREDENTIAL_RETRIEVAL_DENIED',
            accountId: account._id,
            result: 'DENIED',
            ipAddress: req.ip || '127.0.0.1',
            metadata: {
              reason: 'No access grant found for user',
              accountName: account.accountName,
            },
          });

          await incidentService.triggerRuleBasedDetection({
            type: 'FAILED_RETRIEVAL',
            userId: user._id,
            username: user.name,
            accountId: account._id,
            accountName: account.accountName,
            details: 'Attempted retrieval without an access grant',
          });

          res.status(403).json({
            success: false,
            message: 'Access Denied: You do not have an approved access grant for this privileged account. Please submit an access request.',
          });
          return;
        }

        // Check if grant is revoked
        if (grant.revokedAt || grant.status === 'Revoked') {
          await auditService.log({
            userId: user._id,
            username: user.name,
            action: 'CREDENTIAL_RETRIEVAL_DENIED',
            accountId: account._id,
            result: 'DENIED',
            ipAddress: req.ip || '127.0.0.1',
            metadata: {
              reason: 'Access grant has been explicitly revoked by an administrator',
              grantId: grant._id,
            },
          });

          res.status(403).json({
            success: false,
            message: 'Access Denied: Your access grant for this privileged account was revoked by an administrator.',
          });
          return;
        }

        // Check if grant has expired (server-side check)
        if (grant.expiresAt <= now || grant.status === 'Expired') {
          // Mark grant as expired
          grant.status = 'Expired';
          await grant.save();

          await auditService.log({
            userId: user._id,
            username: user.name,
            action: 'CREDENTIAL_RETRIEVAL_DENIED',
            accountId: account._id,
            result: 'DENIED',
            ipAddress: req.ip || '127.0.0.1',
            metadata: {
              reason: 'Access grant has expired',
              expiredAt: grant.expiresAt.toISOString(),
            },
          });

          await incidentService.triggerRuleBasedDetection({
            type: 'EXPIRED_ACCESS_ATTEMPT',
            userId: user._id,
            username: user.name,
            accountId: account._id,
            accountName: account.accountName,
            details: `Grant expired at ${grant.expiresAt.toISOString()}`,
          });

          res.status(403).json({
            success: false,
            message: 'Access Denied: Your temporary access window for this credential has expired. Please submit a new request if needed.',
          });
          return;
        }

        grantExpiryDate = grant.expiresAt;
      }

      // Check Vault health before retrieval
      const vaultHealth = await vaultService.getHealth();
      if (vaultHealth.statusText === 'Unavailable' || vaultHealth.sealed) {
        await incidentService.triggerRuleBasedDetection({
          type: 'VAULT_FAILURE',
          userId: user._id,
          username: user.name,
          accountId: account._id,
          accountName: account.accountName,
          details: 'Vault unavailable during credential retrieval attempt',
        });

        res.status(503).json({
          success: false,
          message: 'HashiCorp Vault is currently sealed or unreachable. Credential retrieval aborted (fail-closed).',
        });
        return;
      }

      // Retrieve secret from HashiCorp Vault KV v2
      const secretData = await vaultService.getSecret(account.vaultSecretPath);

      // Log successful retrieval
      await auditService.log({
        userId: user._id,
        username: user.name,
        action: 'CREDENTIAL_RETRIEVED',
        accountId: account._id,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          accountName: account.accountName,
          accountType: account.accountType,
          role: user.role,
          expiresAt: grantExpiryDate ? grantExpiryDate.toISOString() : 'Admin Emergency Access',
        },
      });

      res.status(200).json({
        success: true,
        message: 'Credential successfully retrieved from HashiCorp Vault',
        credential: {
          accountName: account.accountName,
          accountType: account.accountType,
          hostname: account.hostname,
          username: secretData.username || account.username,
          password: secretData.password,
          expiresAt: grantExpiryDate,
        },
      });
    } catch (error: any) {
      console.error('[Credentials] Retrieval error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve credential from Vault',
      });
    }
  }
);

export default router;
