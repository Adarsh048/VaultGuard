import assert from 'assert';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import app from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../models/User';
import { PrivilegedAccount } from '../models/PrivilegedAccount';
import { AccessRequest } from '../models/AccessRequest';
import { AccessGrant } from '../models/AccessGrant';
import { Incident } from '../models/Incident';
import { AuditLog } from '../models/AuditLog';
import { RotationHistory } from '../models/RotationHistory';
import { vaultService } from '../services/vault.service';

interface TestContext {
  adminCookie: string;
  adminToken: string;
  employeeCookie: string;
  employeeToken: string;
  devCookie: string;
  devToken: string;
  testAccountId: string;
  testSecretPath: string;
}

const ctx: TestContext = {
  adminCookie: '',
  adminToken: '',
  employeeCookie: '',
  employeeToken: '',
  devCookie: '',
  devToken: '',
  testAccountId: '',
  testSecretPath: '',
};

async function runTests() {
  console.log('\n============================================================');
  console.log('   VAULTGUARD PAM SYSTEM - AUTOMATED INTEGRATION TESTS      ');
  console.log('============================================================\n');

  await connectDatabase();

  let passedCount = 0;
  let failedCount = 0;

  async function testStep(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error('       Error:', err.message || err);
      failedCount++;
    }
  }

  // TEST 1: Successful Login
  await testStep('1. Successful Login (Admin & Employee)', async () => {
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@vaultguard.local', password: 'AdminPassword!2026' });

    assert.strictEqual(adminRes.status, 200);
    assert.strictEqual(adminRes.body.success, true);
    assert.strictEqual(adminRes.body.user.role, 'ADMIN');
    assert.ok(adminRes.body.token);

    ctx.adminToken = adminRes.body.token;
    const cookieHeader = adminRes.headers['set-cookie'];
    ctx.adminCookie = cookieHeader ? cookieHeader[0] : '';

    const empRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'employee@vaultguard.local', password: 'EmployeePassword!2026' });

    assert.strictEqual(empRes.status, 200);
    assert.strictEqual(empRes.body.user.role, 'EMPLOYEE');
    ctx.employeeToken = empRes.body.token;
    ctx.employeeCookie = empRes.headers['set-cookie'] ? empRes.headers['set-cookie'][0] : '';

    const devRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'developer@vaultguard.local', password: 'DevPassword!2026' });

    assert.strictEqual(devRes.status, 200);
    ctx.devToken = devRes.body.token;
    ctx.devCookie = devRes.headers['set-cookie'] ? devRes.headers['set-cookie'][0] : '';
  });

  // TEST 2: Invalid Login
  await testStep('2. Invalid Login (Bad Credentials)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@vaultguard.local', password: 'WrongPassword123!' });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  // TEST 3: Role Authorization (RBAC)
  await testStep('3. Role Authorization (Employee accessing admin-only endpoint)', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${ctx.employeeToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Forbidden.*Role 'EMPLOYEE'/i);
  });

  // TEST 4: Account Onboarding (Admin)
  await testStep('4. Account Onboarding (Metadata stored in MongoDB, reference created)', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        accountName: 'TEST-ORACLE-DB01',
        username: 'ora_dba',
        accountType: 'Database Administrator',
        hostname: '10.0.99.10',
        description: 'Test High-Availability Oracle Cluster',
        password: 'InitialOraclePass!2026',
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.account._id);
    assert.ok(res.body.account.vaultSecretPath);

    ctx.testAccountId = res.body.account._id;
    ctx.testSecretPath = res.body.account.vaultSecretPath;

    // Verify in MongoDB: password is NOT in MongoDB
    const mongoAcc = await PrivilegedAccount.findById(ctx.testAccountId).lean();
    assert.ok(mongoAcc);
    assert.strictEqual((mongoAcc as any).password, undefined);
  });

  // TEST 5: Vault Secret Storage
  await testStep('5. Vault Secret Storage (Actual credential is stored in Vault KV v2)', async () => {
    const secret = await vaultService.getSecret(ctx.testSecretPath);
    assert.strictEqual(secret.username, 'ora_dba');
    assert.strictEqual(secret.password, 'InitialOraclePass!2026');
  });

  // TEST 6: Unauthorized Credential Retrieval
  await testStep('6. Unauthorized Credential Retrieval (Employee has no grant -> Denied)', async () => {
    const res = await request(app)
      .post(`/api/accounts/${ctx.testAccountId}/retrieve`)
      .set('Authorization', `Bearer ${ctx.employeeToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Access Denied/i);
  });

  // TEST 7: Access Request Submission
  let requestId = '';
  await testStep('7. Access Request Submission (Employee requests access with justification)', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${ctx.employeeToken}`)
      .send({
        accountId: ctx.testAccountId,
        justification: 'Urgent performance schema query plan optimization for testing.',
        requestedDuration: 30, // 30 minutes
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.request.status, 'Pending');
    requestId = res.body.request._id;
  });

  // TEST 8: Access Request Approval & Self-Approval Prevention
  await testStep('8. Access Request Approval & Self-Approval Prevention', async () => {
    // 8a: Self-approval prevention: Admin cannot self-approve their own request
    const adminSelfReq = await AccessRequest.create({
      requesterId: (await User.findOne({ email: 'admin@vaultguard.local' }))!._id,
      accountId: ctx.testAccountId,
      justification: 'Self request test',
      requestedDuration: 15,
      status: 'Pending',
    });

    const selfApproveRes = await request(app)
      .patch(`/api/requests/${adminSelfReq._id}/approve`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ approvalComment: 'Self approval attempt' });

    assert.strictEqual(selfApproveRes.status, 403);
    assert.match(selfApproveRes.body.message, /Self-approval violation/i);

    // 8b: Admin approves Employee's request
    const approveRes = await request(app)
      .patch(`/api/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ approvalComment: 'Approved for test scenario' });

    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.request.status, 'Approved');
    assert.ok(approveRes.body.grant);
    assert.strictEqual(approveRes.body.grant.status, 'Active');
  });

  // TEST 9: Authorized Credential Retrieval
  await testStep('9. Authorized Credential Retrieval (Employee retrieves with active grant)', async () => {
    const res = await request(app)
      .post(`/api/accounts/${ctx.testAccountId}/retrieve`)
      .set('Authorization', `Bearer ${ctx.employeeToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.credential.username, 'ora_dba');
    assert.strictEqual(res.body.credential.password, 'InitialOraclePass!2026');
    assert.ok(res.body.credential.expiresAt);
  });

  // TEST 10: Access Request Rejection
  await testStep('10. Access Request Rejection (Admin rejects another request)', async () => {
    const devReq = await AccessRequest.create({
      requesterId: (await User.findOne({ email: 'developer@vaultguard.local' }))!._id,
      accountId: ctx.testAccountId,
      justification: 'Unnecessary ad-hoc access request',
      requestedDuration: 60,
      status: 'Pending',
    });

    const rejectRes = await request(app)
      .patch(`/api/requests/${devReq._id}/reject`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ approvalComment: 'Rejected due to insufficient business justification' });

    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.body.request.status, 'Rejected');
  });

  // TEST 11: Expired Access Denial
  await testStep('11. Expired Access Denial (Server-side expiry check denies access)', async () => {
    // Manually set grant expiresAt to 10 minutes in the past
    await AccessGrant.updateOne(
      { requestId },
      { expiresAt: new Date(Date.now() - 10 * 60 * 1000) }
    );

    const res = await request(app)
      .post(`/api/accounts/${ctx.testAccountId}/retrieve`)
      .set('Authorization', `Bearer ${ctx.employeeToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /expired/i);

    // Verify grant status updated to Expired
    const grant = await AccessGrant.findOne({ requestId });
    assert.strictEqual(grant?.status, 'Expired');
  });

  // TEST 12: Revoked Access Denial
  await testStep('12. Revoked Access Denial (Admin explicitly revokes grant)', async () => {
    // Reactivate and then revoke
    await AccessGrant.updateOne(
      { requestId },
      { status: 'Active', expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
    );

    const revokeRes = await request(app)
      .patch(`/api/requests/${requestId}/revoke`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    assert.strictEqual(revokeRes.status, 200);

    // Attempt retrieval after revocation
    const retrieveRes = await request(app)
      .post(`/api/accounts/${ctx.testAccountId}/retrieve`)
      .set('Authorization', `Bearer ${ctx.employeeToken}`);

    assert.strictEqual(retrieveRes.status, 403);
    assert.match(retrieveRes.body.message, /revoked/i);
  });

  // TEST 13: Credential Rotation
  await testStep('13. Credential Rotation (Admin initiates rotation, Vault secret updated)', async () => {
    const res = await request(app)
      .post(`/api/rotation/${ctx.testAccountId}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.history.status, 'SUCCESS');
    assert.strictEqual(res.body.history.vaultSecretUpdated, true);
    assert.strictEqual(res.body.history.passwordVerified, true);

    // Verify in Vault: password changed from initial
    const vaultSecret = await vaultService.getSecret(ctx.testSecretPath);
    assert.notStrictEqual(vaultSecret.password, 'InitialOraclePass!2026');
    assert.ok(vaultSecret.password.length >= 24);

    // Verify RotationHistory recorded in MongoDB
    const historyCount = await RotationHistory.countDocuments({ accountId: ctx.testAccountId });
    assert.ok(historyCount > 0);
  });

  // TEST 14: Vault Unavailable (Fail Closed)
  await testStep('14. Vault Unavailable (Health check handles failure & fails closed)', async () => {
    // Query health endpoint
    const res = await request(app)
      .get('/api/monitoring/vault-health')
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.monitoring.vault.status);
    assert.strictEqual(res.body.monitoring.vault.sealed, false);
  });

  // TEST 15: Audit Log & Incident Generation / Resolution
  await testStep('15. Audit Log Generation & Incident Resolution', async () => {
    // 15a: Verify Audit Logs
    const auditRes = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    assert.strictEqual(auditRes.status, 200);
    assert.ok(auditRes.body.logs.length > 0);

    // Verify no passwords exist in any audit metadata
    for (const log of auditRes.body.logs) {
      const metaStr = JSON.stringify(log.metadata || {});
      assert.strictEqual(metaStr.includes('InitialOraclePass!2026'), false);
    }

    // 15b: Create and Resolve Incident
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        title: 'Suspicious Lateral Movement Attempt on Oracle Cluster',
        description: 'Simulated brute-force access alert from external subnet.',
        severity: 'High',
        initialNote: 'IP 192.168.1.99 blacklisted on network firewall.',
      });

    assert.strictEqual(incRes.status, 201);
    const incId = incRes.body.incident._id;

    // Resolve incident
    const resolveRes = await request(app)
      .patch(`/api/incidents/${incId}/resolve`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        resolutionDetails: 'Threat mitigated. Firewall rules updated and IP blocked.',
      });

    assert.strictEqual(resolveRes.status, 200);
    assert.strictEqual(resolveRes.body.incident.status, 'Resolved');
  });

  console.log('\n------------------------------------------------------------');
  console.log(`SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED out of ${passedCount + failedCount} tests.`);
  console.log('------------------------------------------------------------\n');

  await disconnectDatabase();
  process.exit(failedCount > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
