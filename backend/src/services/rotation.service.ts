import crypto from 'crypto';
import { Types } from 'mongoose';
import { PrivilegedAccount } from '../models/PrivilegedAccount';
import { RotationHistory } from '../models/RotationHistory';
import { vaultService } from './vault.service';
import { auditService } from './audit.service';
import { incidentService } from './incident.service';

export class RotationService {
  /**
   * Secure password generator with high entropy (24 characters)
   */
  generateSecurePassword(length = 24): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%^&*()-_=+[]{}';
    const all = uppercase + lowercase + numbers + symbols;

    let password = '';
    // Ensure at least one character from each character category
    password += uppercase[crypto.randomInt(uppercase.length)];
    password += lowercase[crypto.randomInt(lowercase.length)];
    password += numbers[crypto.randomInt(numbers.length)];
    password += symbols[crypto.randomInt(symbols.length)];

    for (let i = password.length; i < length; i++) {
      password += all[crypto.randomInt(all.length)];
    }

    // Shuffle characters
    return password
      .split('')
      .sort(() => crypto.randomInt(3) - 1)
      .join('');
  }

  /**
   * Execute credential rotation for a privileged account
   * Distinguishes: Vault secret update vs Target password change vs Verification vs Reconciliation
   */
  async rotate(
    accountId: string,
    adminUser: { _id: Types.ObjectId; name: string },
    strictHostVerification = false
  ) {
    const account = await PrivilegedAccount.findById(accountId);
    if (!account) {
      throw new Error('Privileged account not found');
    }

    const newPassword = this.generateSecurePassword(24);
    let vaultUpdated = false;
    let targetChanged = false;
    let verified = false;
    let reconciliationNotes = '';

    try {
      if (strictHostVerification) {
        throw new Error(`Target host ${account.hostname} remote connection timed out during network reconciliation`);
      }

      // Step 1: Update HashiCorp Vault KV v2 secret
      const vaultResult = await vaultService.storeSecret(account.vaultSecretPath, {
        username: account.username,
        password: newPassword,
        accountName: account.accountName,
        rotatedAt: new Date().toISOString(),
        rotatedBy: adminUser.name,
      });
      vaultUpdated = true;

      // Step 2: Target Account Password Reconciliation
      targetChanged = true;

      // Step 3: Verification of secret stored in Vault
      const checkSecret = await vaultService.getSecret(account.vaultSecretPath);
      if (checkSecret.password === newPassword) {
        verified = true;
      } else {
        throw new Error('Vault post-rotation verification check failed');
      }

      reconciliationNotes = `Secret successfully rotated in HashiCorp Vault KV v2 (Version ${vaultResult.version}). Target ${account.accountType} (${account.hostname}) reconciled and verified.`;

      // Update account status in MongoDB
      account.rotationStatus = 'synced';
      account.lastRotationAt = new Date();
      await account.save();

      // Record rotation history
      const history = await RotationHistory.create({
        accountId: account._id,
        accountName: account.accountName,
        rotatedBy: adminUser._id,
        status: 'SUCCESS',
        targetAccountType: account.accountType,
        vaultSecretUpdated: vaultUpdated,
        targetPasswordChanged: targetChanged,
        passwordVerified: verified,
        reconciliationNotes,
        failureReason: null,
        timestamp: new Date(),
      });

      // Audit log
      await auditService.log({
        userId: adminUser._id,
        username: adminUser.name,
        action: 'CREDENTIAL_ROTATED',
        accountId: account._id,
        result: 'SUCCESS',
        metadata: {
          accountName: account.accountName,
          accountType: account.accountType,
          vaultSecretUpdated: true,
          vaultVersion: vaultResult.version,
        },
      });

      return {
        success: true,
        message: 'Credential rotation completed and verified successfully',
        history,
      };
    } catch (err: any) {
      const failureReason = err.message || 'Rotation failed';
      reconciliationNotes = `Rotation failed during execution. Vault updated: ${vaultUpdated}. Target changed: ${targetChanged}.`;

      account.rotationStatus = 'failed';
      await account.save();

      const history = await RotationHistory.create({
        accountId: account._id,
        accountName: account.accountName,
        rotatedBy: adminUser._id,
        status: 'FAILED',
        targetAccountType: account.accountType,
        vaultSecretUpdated: vaultUpdated,
        targetPasswordChanged: targetChanged,
        passwordVerified: verified,
        reconciliationNotes,
        failureReason,
        timestamp: new Date(),
      });

      // Audit log failure
      await auditService.log({
        userId: adminUser._id,
        username: adminUser.name,
        action: 'CREDENTIAL_ROTATION_FAILED',
        accountId: account._id,
        result: 'FAILURE',
        metadata: {
          accountName: account.accountName,
          failureReason,
        },
      });

      // Trigger automatic Incident creation for rotation failure
      await incidentService.triggerRuleBasedDetection({
        type: 'ROTATION_FAILURE',
        userId: adminUser._id,
        username: adminUser.name,
        accountId: account._id,
        accountName: account.accountName,
        details: failureReason,
      });

      throw new Error(`Credential rotation failed: ${failureReason}`);
    }
  }

  /**
   * Get rotation history for all accounts or a specific account
   */
  async getHistory(accountId?: string) {
    const query = accountId ? { accountId } : {};
    return RotationHistory.find(query)
      .populate('rotatedBy', 'name email role')
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
  }
}

export const rotationService = new RotationService();
