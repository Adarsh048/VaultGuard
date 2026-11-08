import bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../models/User';
import { PrivilegedAccount } from '../models/PrivilegedAccount';
import { AccessRequest } from '../models/AccessRequest';
import { AccessGrant } from '../models/AccessGrant';
import { Incident } from '../models/Incident';
import { AuditLog } from '../models/AuditLog';
import { RotationHistory } from '../models/RotationHistory';
import { vaultService } from '../services/vault.service';

async function seed() {
  console.log('[Seed] Initializing enterprise database collections and Vault secrets...');
  await connectDatabase();

  // Clear existing collections
  await Promise.all([
    User.deleteMany({}),
    PrivilegedAccount.deleteMany({}),
    AccessRequest.deleteMany({}),
    AccessGrant.deleteMany({}),
    Incident.deleteMany({}),
    AuditLog.deleteMany({}),
    RotationHistory.deleteMany({}),
  ]);

  // Create Operational Users
  const adminPasswordHash = await bcrypt.hash('AdminPassword!2026', 10);
  const employeePasswordHash = await bcrypt.hash('EmployeePassword!2026', 10);
  const devPasswordHash = await bcrypt.hash('DevPassword!2026', 10);

  const admin = await User.create({
    name: 'Alexander Vance',
    email: 'admin@vaultguard.local',
    passwordHash: adminPasswordHash,
    role: 'ADMIN',
    status: 'active',
  });

  const employee = await User.create({
    name: 'Sarah Jenkins',
    email: 'employee@vaultguard.local',
    passwordHash: employeePasswordHash,
    role: 'EMPLOYEE',
    status: 'active',
  });

  const developer = await User.create({
    name: 'David Kim',
    email: 'developer@vaultguard.local',
    passwordHash: devPasswordHash,
    role: 'EMPLOYEE',
    status: 'active',
  });

  console.log(`[Seed] Initialized users: ${admin.email}, ${employee.email}, ${developer.email}`);

  // Check Vault health before storing accounts
  const health = await vaultService.getHealth();
  if (health.statusText === 'Unavailable') {
    console.error('[Seed] Cannot seed Vault secrets: Vault is unreachable!');
  } else {
    console.log('[Seed] HashiCorp Vault is healthy. Writing privileged credentials to KV v2...');

    // Account 1: Windows Domain Controller
    const accId1 = new Types.ObjectId();
    const path1 = `accounts/acc_${accId1.toString()}`;
    await vaultService.storeSecret(path1, {
      accountName: 'PROD-DC01-AD',
      username: 'corp.admin',
      password: 'WinDomainAdm#2026!Xv9',
      accountType: 'Windows Administrator',
      hostname: '10.0.10.15',
      createdAt: new Date().toISOString(),
    });

    const acc1 = await PrivilegedAccount.create({
      _id: accId1,
      accountName: 'PROD-DC01-AD',
      username: 'corp.admin',
      accountType: 'Windows Administrator',
      hostname: '10.0.10.15',
      ownerId: admin._id,
      description: 'Active Directory Primary Domain Controller for corporate domain services and Kerberos KDC',
      vaultSecretPath: path1,
      rotationStatus: 'synced',
      lastRotationAt: new Date(Date.now() - 48 * 3600 * 1000),
    });

    // Account 2: Linux Core Node
    const accId2 = new Types.ObjectId();
    const path2 = `accounts/acc_${accId2.toString()}`;
    await vaultService.storeSecret(path2, {
      accountName: 'K8S-MASTER-CORE01',
      username: 'root',
      password: 'LinRootCore$2026@P9q',
      accountType: 'Linux Root',
      hostname: '10.0.12.44',
      createdAt: new Date().toISOString(),
    });

    const acc2 = await PrivilegedAccount.create({
      _id: accId2,
      accountName: 'K8S-MASTER-CORE01',
      username: 'root',
      accountType: 'Linux Root',
      hostname: '10.0.12.44',
      ownerId: admin._id,
      description: 'Production Kubernetes Control Plane Master Node 01 executing core microservices orchestration',
      vaultSecretPath: path2,
      rotationStatus: 'synced',
      lastRotationAt: new Date(Date.now() - 24 * 3600 * 1000),
    });

    // Account 3: Database Administrator
    const accId3 = new Types.ObjectId();
    const path3 = `accounts/acc_${accId3.toString()}`;
    await vaultService.storeSecret(path3, {
      accountName: 'FIN-POSTGRES-PRIMARY',
      username: 'postgres_dba',
      password: 'PgAdminFinDB!2026#7z',
      accountType: 'Database Administrator',
      hostname: '10.0.20.101',
      createdAt: new Date().toISOString(),
    });

    const acc3 = await PrivilegedAccount.create({
      _id: accId3,
      accountName: 'FIN-POSTGRES-PRIMARY',
      username: 'postgres_dba',
      accountType: 'Database Administrator',
      hostname: '10.0.20.101',
      ownerId: admin._id,
      description: 'Production Financial Ledger Relational Database Cluster (PCI-DSS Scoped)',
      vaultSecretPath: path3,
      rotationStatus: 'synced',
      lastRotationAt: new Date(Date.now() - 12 * 3600 * 1000),
    });

    // Account 4: Service Account (Backup)
    const accId4 = new Types.ObjectId();
    const path4 = `accounts/acc_${accId4.toString()}`;
    await vaultService.storeSecret(path4, {
      accountName: 'BKP-STORAGE-VEEAM01',
      username: 'svc_veeam_bkp',
      password: 'BkpSvcPass2026!Secure',
      accountType: 'Service Account',
      hostname: '10.0.50.80',
      createdAt: new Date().toISOString(),
    });

    const acc4 = await PrivilegedAccount.create({
      _id: accId4,
      accountName: 'BKP-STORAGE-VEEAM01',
      username: 'svc_veeam_bkp',
      accountType: 'Service Account',
      hostname: '10.0.50.80',
      ownerId: admin._id,
      description: 'Enterprise Veeam Disaster Recovery automation service account for SAN snapshot replication',
      vaultSecretPath: path4,
      rotationStatus: 'pending',
      lastRotationAt: null,
    });

    console.log('[Seed] Privileged accounts created and secured in HashiCorp Vault KV v2');

    // Pending access request from Systems Engineer
    const pendingReq = await AccessRequest.create({
      requesterId: employee._id,
      accountId: acc2._id,
      justification: 'RFC-2026-4412: Urgent mitigation of OpenSSL vulnerability CVE-2026-2184 on production master node.',
      requestedDuration: 60,
      status: 'Pending',
    });

    // Approved request and active grant for Database maintenance
    const approvedReq = await AccessRequest.create({
      requesterId: employee._id,
      accountId: acc3._id,
      justification: 'CHG-2026-8109: Production ledger table vacuuming and index reconstruction following high IOPS latency threshold alert.',
      requestedDuration: 120,
      status: 'Approved',
      reviewedBy: admin._id,
      approvalComment: 'Approved for scheduled change window CHG-2026-8109 following CAB review.',
    });

    const activeGrant = await AccessGrant.create({
      userId: employee._id,
      accountId: acc3._id,
      requestId: approvedReq._id,
      approvedBy: admin._id,
      expiresAt: new Date(Date.now() + 90 * 60 * 1000), // Active for 90 minutes
      status: 'Active',
    });

    // Active Security Incident
    await Incident.create({
      incidentId: 'INC-2026-0001',
      title: 'Repeated Unauthorized Credential Checkout Attempt',
      description: 'Multiple credential checkout attempts rejected for ungranted asset PROD-DC01-AD originating from workstation 10.0.4.12.',
      severity: 'Medium',
      relatedUserId: developer._id,
      relatedAccountId: acc1._id,
      status: 'Open',
      assignedTo: admin._id,
      investigationNotes: [
        {
          text: 'Security filter denied request. Developer notified of mandatory ticket linkage for privileged checkout.',
          author: 'Security Operations Center',
          timestamp: new Date(Date.now() - 3 * 3600 * 1000),
        },
      ],
      resolutionDetails: '',
    });

    // Initial Audit Records
    const auditEvents = [
      {
        userId: admin._id,
        username: admin.name,
        action: 'SYSTEM_INITIALIZED',
        result: 'SUCCESS' as const,
        ipAddress: '127.0.0.1',
        metadata: { version: '1.0.0', secretsEngine: 'vault-kv-v2' },
        timestamp: new Date(Date.now() - 72 * 3600 * 1000),
      },
      {
        userId: admin._id,
        username: admin.name,
        action: 'ACCOUNT_ONBOARDED',
        accountId: acc1._id,
        result: 'SUCCESS' as const,
        ipAddress: '127.0.0.1',
        metadata: { accountName: acc1.accountName, accountType: acc1.accountType },
        timestamp: new Date(Date.now() - 48 * 3600 * 1000),
      },
      {
        userId: admin._id,
        username: admin.name,
        action: 'ACCOUNT_ONBOARDED',
        accountId: acc2._id,
        result: 'SUCCESS' as const,
        ipAddress: '127.0.0.1',
        metadata: { accountName: acc2.accountName, accountType: acc2.accountType },
        timestamp: new Date(Date.now() - 24 * 3600 * 1000),
      },
      {
        userId: employee._id,
        username: employee.name,
        action: 'ACCESS_REQUEST_SUBMITTED',
        accountId: acc2._id,
        result: 'SUCCESS' as const,
        ipAddress: '127.0.0.1',
        metadata: { requestId: pendingReq._id, durationMinutes: 60 },
        timestamp: new Date(Date.now() - 4 * 3600 * 1000),
      },
      {
        userId: admin._id,
        username: admin.name,
        action: 'ACCESS_REQUEST_APPROVED',
        accountId: acc3._id,
        result: 'SUCCESS' as const,
        ipAddress: '127.0.0.1',
        metadata: { requestId: approvedReq._id, grantId: activeGrant._id },
        timestamp: new Date(Date.now() - 2 * 3600 * 1000),
      },
    ];

    await AuditLog.insertMany(auditEvents);
    console.log('[Seed] Audit ledger and access grants successfully committed.');
  }

  await disconnectDatabase();
  console.log('[Seed] Database initialization completed successfully.');
}

seed().catch((err) => {
  console.error('[Seed] Error during seeding:', err);
  process.exit(1);
});
