import crypto from 'crypto';
import { Types } from 'mongoose';
import { PrivilegedAccount } from '../models/PrivilegedAccount';
import { RotationHistory } from '../models/RotationHistory';
import { vaultService } from './vault.service';
import { auditService } from './audit.service';
import { incidentService } from './incident.service';

export class RotationService {
  /**
   * Secure password generator with high cryptographic entropy
   */
  generateSecurePassword(length = 24): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%^&*()-_=+[]{}';
    const all = uppercase + lowercase + numbers + symbols;

    let password = '';
    // Ensure at least one character from each set
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
   * Execute credential rotation for a privileged account.
   *
   * TECHNICAL DISTINCTION:
   * 1. Vault Secret Update: Updates the KV v2 secret in HashiCorp Vault and verifies it.
   * 2. Target Account Password Rotation: Explicitly marked as NOT_IMPLEMENTED.
   *    In enterprise PAM (e.g. CyberArk CPM), target password rotation requires remote agents,
   *    WMI/RPC for Windows, or SSH keys for Linux. Updating Vault does NOT change target OS password.
   */
  async rotate(
    accountId: string,
    adminUser: { _id: Types.ObjectId; name: string }
  ) {
    const account = await PrivilegedAccount.findById(accountId);
    if (!account) {
      throw new Error('Privileged account not found');
    }

    const newPassword = this.generateSecurePassword(24);
    let vaultUpdated = false;
    let verified = false;
    let vaultVersion = 1;

    try {
      // Step 1: Update HashiCorp Vault KV v2 secret
      const vaultResult = await vaultService.storeSecret(account.vaultSecretPath, {
        username: account.username,
        password: newPassword,
        accountName: account.accountName,
        rotatedAt: new Date().toISOString(),
        rotatedBy: adminUser.name,
      });
      vaultUpdated = true;
      vaultVersion = vaultResult.version;

      // Step 2: Verification of secret stored in Vault (without printing password)
      const checkSecret = await vaultService.getSecret(account.vaultSecretPath);
      if (checkSecret.password === newPassword) {
        verified = true;
      } else {
        throw new Error('Vault post-rotation verification check failed: secret mismatch');
      }

      // Step 3: Target Account Password Status
      // Strictly honest: We do not connect to Windows/Linux endpoints to change OS passwords.
      const targetPasswordChanged = false;
      const targetStatus = 'NOT_IMPLEMENTED';
      const reconciliationNotes = `Vault KV v2 secret updated to Version ${vaultVersion} and verified. Target ${account.accountType} (${account.hostname}) endpoint password rotation is NOT_IMPLEMENTED (requires remote agent or SSH/WMI connection plugin).`;

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
        vaultSecretVersion: vaultVersion,
        targetPasswordChanged,
        targetStatus,
        passwordVerified: verified,
        reconciliationNotes,
        failureReason: null,
        timestamp: new Date(),
      });

      // Audit log (never log the password!)
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
          vaultVersion,
          targetStatus: 'NOT_IMPLEMENTED',
        },
      });

      return {
        success: true,
        message: 'Vault secret updated and verified. Target OS password change is NOT_IMPLEMENTED.',
        vaultVersion,
        targetStatus: 'NOT_IMPLEMENTED',
        history,
      };
    } catch (err: any) {
      const failureReason = err.message || 'Vault secret update failed';
      const reconciliationNotes = `Rotation failed during Vault update: ${failureReason}`;

      account.rotationStatus = 'failed';
      await account.save();

      const history = await RotationHistory.create({
        accountId: account._id,
        accountName: account.accountName,
        rotatedBy: adminUser._id,
        status: 'FAILED',
        targetAccountType: account.accountType,
        vaultSecretUpdated: vaultUpdated,
        vaultSecretVersion: vaultVersion,
        targetPasswordChanged: false,
        targetStatus: 'FAILED',
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
