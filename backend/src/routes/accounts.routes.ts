import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { PrivilegedAccount } from '../models/PrivilegedAccount';
import { vaultService } from '../services/vault.service';
import { auditService } from '../services/audit.service';
import { incidentService } from '../services/incident.service';
import {
  createAccountSchema,
  updateAccountSchema,
} from '../validations/account.validation';

const router = Router();

// POST /api/accounts - Onboard new privileged account (ADMIN only)
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parseResult = createAccountSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: parseResult.error.errors[0]?.message || 'Invalid account details',
        });
        return;
      }

      const { accountName, username, accountType, hostname, description, password } =
        parseResult.data;

      // Check if Vault is available before creating DB record (fail closed principle)
      const vaultHealth = await vaultService.getHealth();
      if (vaultHealth.statusText === 'Unavailable' || vaultHealth.sealed) {
        await incidentService.triggerRuleBasedDetection({
          type: 'VAULT_FAILURE',
          userId: req.user?._id,
          username: req.user?.name,
          details: 'Vault unavailable during privileged account onboarding',
        });
        res.status(503).json({
          success: false,
          message: 'HashiCorp Vault is currently sealed or unavailable. Operation aborted to protect credentials.',
        });
        return;
      }

      // Generate unique secret path
      const accountId = new Types.ObjectId();
      const vaultSecretPath = `accounts/acc_${accountId.toString()}`;

      // 1. Store actual credentials in HashiCorp Vault KV v2
      await vaultService.storeSecret(vaultSecretPath, {
        accountName,
        username,
        password,
        accountType,
        hostname,
        createdAt: new Date().toISOString(),
      });

      // 2. Store non-sensitive metadata only in MongoDB
      const newAccount = await PrivilegedAccount.create({
        _id: accountId,
        accountName,
        username,
        accountType,
        hostname,
        ownerId: req.user?._id,
        description,
        vaultSecretPath,
        rotationStatus: 'synced',
        lastRotationAt: new Date(),
      });

      // 3. Log audit event
      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'ACCOUNT_ONBOARDED',
        accountId: newAccount._id,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          accountName,
          accountType,
          hostname,
          vaultSecretPath,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Privileged account onboarded and credentials stored securely in Vault',
        account: newAccount,
      });
    } catch (error: any) {
      console.error('[Accounts] Onboarding error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to onboard privileged account',
      });
    }
  }
);

// GET /api/accounts - List privileged accounts
router.get(
  '/',
  authenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const isAdmin = req.user?.role === 'ADMIN';

      // Both Admins and Employees can view account metadata.
      // MongoDB does NOT contain passwords anyway!
      const query = PrivilegedAccount.find()
        .populate('ownerId', 'name email')
        .sort({ createdAt: -1 });

      const accounts = await query.lean();

      res.status(200).json({
        success: true,
        count: accounts.length,
        accounts,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to retrieve accounts' });
    }
  }
);

// GET /api/accounts/:id - Get account details
router.get(
  '/:id',
  authenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const account = await PrivilegedAccount.findById(req.params.id)
        .populate('ownerId', 'name email')
        .lean();

      if (!account) {
        res.status(404).json({ success: false, message: 'Privileged account not found' });
        return;
      }

      res.status(200).json({
        success: true,
        account,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to retrieve account' });
    }
  }
);

// PUT /api/accounts/:id - Update account metadata or password (ADMIN only)
router.put(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parseResult = updateAccountSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: parseResult.error.errors[0]?.message || 'Invalid update data',
        });
        return;
      }

      const account = await PrivilegedAccount.findById(req.params.id);
      if (!account) {
        res.status(404).json({ success: false, message: 'Privileged account not found' });
        return;
      }

      const { accountName, username, accountType, hostname, description, newPassword } =
        parseResult.data;

      if (accountName) account.accountName = accountName;
      if (username) account.username = username;
      if (accountType) account.accountType = accountType;
      if (hostname) account.hostname = hostname;
      if (description !== undefined) account.description = description;

      // If new password provided, update HashiCorp Vault
      if (newPassword) {
        await vaultService.storeSecret(account.vaultSecretPath, {
          accountName: account.accountName,
          username: account.username,
          password: newPassword,
          accountType: account.accountType,
          hostname: account.hostname,
          updatedAt: new Date().toISOString(),
        });
        account.lastRotationAt = new Date();
        account.rotationStatus = 'synced';
      }

      await account.save();

      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'ACCOUNT_UPDATED',
        accountId: account._id,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          accountName: account.accountName,
          passwordUpdated: Boolean(newPassword),
        },
      });

      res.status(200).json({
        success: true,
        message: 'Privileged account updated successfully',
        account,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Failed to update account' });
    }
  }
);

// DELETE /api/accounts/:id - Delete privileged account & purge Vault secret (ADMIN only)
router.delete(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const account = await PrivilegedAccount.findById(req.params.id);
      if (!account) {
        res.status(404).json({ success: false, message: 'Privileged account not found' });
        return;
      }

      // 1. Delete secret in HashiCorp Vault KV v2
      try {
        await vaultService.deleteSecret(account.vaultSecretPath);
      } catch (vaultErr) {
        console.warn('[Vault] Warning deleting secret from vault:', vaultErr);
      }

      // 2. Remove record from MongoDB
      await PrivilegedAccount.findByIdAndDelete(account._id);

      // 3. Log audit event
      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'ACCOUNT_DELETED',
        accountId: account._id,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          accountName: account.accountName,
          vaultSecretPath: account.vaultSecretPath,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Privileged account and corresponding Vault secret deleted',
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to delete account' });
    }
  }
);

export default router;

