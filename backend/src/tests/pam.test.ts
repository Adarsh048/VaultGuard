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

interface UserSession {
  cookieHeader: string;
  csrfToken: string;
  user: any;
}

const sessions: {
  admin: UserSession;
  employee: UserSession;
  developer: UserSession;
} = {
  admin: { cookieHeader: '', csrfToken: '', user: null },
  employee: { cookieHeader: '', csrfToken: '', user: null },
  developer: { cookieHeader: '', csrfToken: '', user: null },
};

let testAccountId = '';
let testSecretPath = '';
let requestId = '';

function extractAuthSession(res: request.Response): { cookieHeader: string; csrfToken: string } {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return { cookieHeader: '', csrfToken: '' };

  const cookiesArray = Array.isArray(setCookie) ? setCookie : [setCookie];
  let tokenCookie = '';
  let csrfCookie = '';
  let csrfToken = '';

  for (const c of cookiesArray) {
    const part = c.split(';')[0].trim();
    if (part.startsWith('vaultguard_token=')) {
      tokenCookie = part;
    } else if (part.startsWith('vaultguard_csrf=')) {
      csrfCookie = part;
      csrfToken = part.replace('vaultguard_csrf=', '');
    }
  }

  const cookieHeader = [tokenCookie, csrfCookie].filter(Boolean).join('; ');
  return { cookieHeader, csrfToken };
}

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

  // TEST 1: Successful Login & Strict Cookie Authentication (No JWT in JSON)
  await testStep('1. Successful Login & Cookie-Only JWT Auth (Admin, Employee, Developer)', async () => {
    // 1a: Admin Login
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@vaultguard.local', password: 'AdminPassword!2026' });

    assert.strictEqual(adminRes.status, 200);
    assert.strictEqual(adminRes.body.success, true);
    assert.strictEqual(adminRes.body.user.role, 'ADMIN');
    // Ensure JWT is NEVER exposed in the JSON response body
    assert.strictEqual((adminRes.body as any).token, undefined);

    const adminSession = extractAuthSession(adminRes);
    assert.ok(adminSession.cookieHeader.includes('vaultguard_token='));
    assert.ok(adminSession.csrfToken.length > 0);
    sessions.admin = { ...adminSession, user: adminRes.body.user };

    // 1b: Employee Login
    const empRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'employee@vaultguard.local', password: 'EmployeePassword!2026' });

    assert.strictEqual(empRes.status, 200);
    assert.strictEqual(empRes.body.user.role, 'EMPLOYEE');
    assert.strictEqual((empRes.body as any).token, undefined);
    const empSession = extractAuthSession(empRes);
    assert.ok(empSession.cookieHeader.includes('vaultguard_token='));
    sessions.employee = { ...empSession, user: empRes.body.user };

    // 1c: Developer Login
    const devRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'developer@vaultguard.local', password: 'DevPassword!2026' });

    assert.strictEqual(devRes.status, 200);
    assert.strictEqual((devRes.body as any).token, undefined);
    const devSession = extractAuthSession(devRes);
    sessions.developer = { ...devSession, user: devRes.body.user };
  });

  // TEST 2: Invalid Login (Bad Credentials)
  await testStep('2. Invalid Login (Bad Credentials Rejected)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@vaultguard.local', password: 'WrongPassword123!' });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  // TEST 3: CSRF Protection Verification
  await testStep('3. CSRF Protection (State-changing cookie request without X-CSRF-Token blocked)', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .set('Cookie', sessions.admin.cookieHeader)
      // Omit X-CSRF-Token header
      .send({
        accountName: 'TEST-CSRF-BLOCK',
        username: 'csrf_test',
        accountType: 'Linux Root',
        hostname: '10.0.0.1',
        password: 'CsrfPassword!2026',
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /CSRF validation failed/i);
  });

  // TEST 4: Role-Based Access Control (RBAC)
  await testStep('4. Role-Based Access Control (Employee accessing admin-only endpoint blocked)', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Cookie', sessions.employee.cookieHeader);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Forbidden.*Role 'EMPLOYEE'/i);
  });

  // TEST 5: Account Onboarding (Admin)
  await testStep('5. Account Onboarding (Metadata stored in MongoDB, credential in Vault KV v2)', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken)
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

    testAccountId = res.body.account._id;
    testSecretPath = res.body.account.vaultSecretPath;

    // Verify in MongoDB: password is NOT in MongoDB
    const mongoAcc = await PrivilegedAccount.findById(testAccountId).lean();
    assert.ok(mongoAcc);
    assert.strictEqual((mongoAcc as any).password, undefined);
  });

  // TEST 6: Vault Secret Storage Verification
  await testStep('6. Vault Secret Storage Verification (Credential verified directly in KV v2)', async () => {
    const secret = await vaultService.getSecret(testSecretPath);
    assert.strictEqual(secret.username, 'ora_dba');
    assert.strictEqual(secret.password, 'InitialOraclePass!2026');
  });

  // TEST 7: Unauthorized Credential Retrieval
  await testStep('7. Unauthorized Credential Retrieval (Employee without active grant blocked)', async () => {
    const res = await request(app)
      .post(`/api/accounts/${testAccountId}/retrieve`)
      .set('Cookie', sessions.employee.cookieHeader)
      .set('X-CSRF-Token', sessions.employee.csrfToken);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Access Denied/i);
  });

  // TEST 8: Access Request Submission
  await testStep('8. Access Request Submission (Employee submits request with business justification)', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Cookie', sessions.employee.cookieHeader)
      .set('X-CSRF-Token', sessions.employee.csrfToken)
      .send({
        accountId: testAccountId,
        justification: 'Urgent performance schema query plan optimization for testing.',
        requestedDuration: 30, // 30 minutes
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.request.status, 'Pending');
    requestId = res.body.request._id;
  });

  // TEST 9: Access Request Approval & Self-Approval Prevention
  await testStep('9. Access Request Approval & Self-Approval Prevention', async () => {
    // 9a: Self-approval prevention: Admin cannot self-approve their own request
    const adminUser = await User.findOne({ email: 'admin@vaultguard.local' });
    const adminSelfReq = await AccessRequest.create({
      requesterId: adminUser!._id,
      accountId: testAccountId,
      justification: 'Self request test by administrator',
      requestedDuration: 15,
      status: 'Pending',
    });

    const selfApproveRes = await request(app)
      .patch(`/api/requests/${adminSelfReq._id}/approve`)
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken)
      .send({ approvalComment: 'Self approval attempt' });

    assert.strictEqual(selfApproveRes.status, 403);
    assert.match(selfApproveRes.body.message, /Self-approval violation/i);

    // 9b: Admin approves Employee's request
    const approveRes = await request(app)
      .patch(`/api/requests/${requestId}/approve`)
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken)
      .send({ approvalComment: 'Approved for test scenario' });

    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.request.status, 'Approved');
    assert.ok(approveRes.body.grant);
    assert.strictEqual(approveRes.body.grant.status, 'Active');
  });

  // TEST 10: Authorized Credential Retrieval
  await testStep('10. Authorized Credential Retrieval (Employee retrieves with active grant)', async () => {
    const res = await request(app)
      .post(`/api/accounts/${testAccountId}/retrieve`)
      .set('Cookie', sessions.employee.cookieHeader)
      .set('X-CSRF-Token', sessions.employee.csrfToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.credential.username, 'ora_dba');
    assert.strictEqual(res.body.credential.password, 'InitialOraclePass!2026');
    assert.ok(res.body.credential.expiresAt);
  });

  // TEST 11: Access Request Rejection
  await testStep('11. Access Request Rejection (Admin rejects request)', async () => {
    const devUser = await User.findOne({ email: 'developer@vaultguard.local' });
    const devReq = await AccessRequest.create({
      requesterId: devUser!._id,
      accountId: testAccountId,
      justification: 'Ad-hoc query test without change order',
      requestedDuration: 60,
      status: 'Pending',
    });

    const rejectRes = await request(app)
      .patch(`/api/requests/${devReq._id}/reject`)
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken)
      .send({ approvalComment: 'Rejected due to missing approved CAB ticket.' });

    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.body.request.status, 'Rejected');
  });

  // TEST 12: Expired Access Denial
  await testStep('12. Expired Access Denial (Server-side expiry check fails closed)', async () => {
    // Set grant expiresAt to 10 minutes in the past
    await AccessGrant.updateOne(
      { requestId },
      { expiresAt: new Date(Date.now() - 10 * 60 * 1000) }
    );

    const res = await request(app)
      .post(`/api/accounts/${testAccountId}/retrieve`)
      .set('Cookie', sessions.employee.cookieHeader)
      .set('X-CSRF-Token', sessions.employee.csrfToken);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /expired/i);

    // Verify grant status updated to Expired
    const grant = await AccessGrant.findOne({ requestId });
    assert.strictEqual(grant?.status, 'Expired');
  });

  // TEST 13: Revoked Access Denial
  await testStep('13. Revoked Access Denial (Admin explicitly revokes grant)', async () => {
    // Reactivate and then revoke
    await AccessGrant.updateOne(
      { requestId },
      { status: 'Active', expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
    );

    const revokeRes = await request(app)
      .patch(`/api/requests/${requestId}/revoke`)
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken);

    assert.strictEqual(revokeRes.status, 200);

    // Attempt retrieval after revocation
    const retrieveRes = await request(app)
      .post(`/api/accounts/${testAccountId}/retrieve`)
      .set('Cookie', sessions.employee.cookieHeader)
      .set('X-CSRF-Token', sessions.employee.csrfToken);

    assert.strictEqual(retrieveRes.status, 403);
    assert.match(retrieveRes.body.message, /revoked/i);
  });

  // TEST 14: Credential Rotation (Vault KV v2 Updated & Honest Target Status)
  await testStep('14. Credential Rotation (Vault KV v2 secret rotated; Target OS honestly reported)', async () => {
    const res = await request(app)
      .post(`/api/rotation/${testAccountId}`)
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.history.status, 'SUCCESS');
    assert.strictEqual(res.body.history.vaultSecretUpdated, true);
    assert.strictEqual(res.body.history.passwordVerified, true);
    // Crucial: Must honestly report NOT_IMPLEMENTED for target OS rotation
    assert.strictEqual(res.body.history.targetPasswordChanged, false);
    assert.strictEqual(res.body.history.targetStatus, 'NOT_IMPLEMENTED');

    // Verify in Vault: password changed from initial
    const vaultSecret = await vaultService.getSecret(testSecretPath);
    assert.notStrictEqual(vaultSecret.password, 'InitialOraclePass!2026');
    assert.ok(vaultSecret.password.length >= 24);

    // Verify RotationHistory recorded in MongoDB
    const historyCount = await RotationHistory.countDocuments({ accountId: testAccountId });
    assert.ok(historyCount > 0);
  });

  // TEST 15: Tamper-Evident Audit Log Cryptographic Hash Chaining
  await testStep('15. Tamper-Evident Audit Log Integrity Verification & Tamper Detection', async () => {
    // 15a: Verify intact hash chain
    const verifyRes1 = await request(app)
      .get('/api/audit/verify')
      .set('Cookie', sessions.admin.cookieHeader);

    assert.strictEqual(verifyRes1.status, 200);
    assert.strictEqual(verifyRes1.body.success, true);
    assert.strictEqual(verifyRes1.body.verification.valid, true);
    assert.ok(verifyRes1.body.verification.totalChecked > 0);

    // 15b: Tamper simulation - modify one document directly in MongoDB
    const targetDoc = await AuditLog.findOne({ sequenceNumber: 2 });
    assert.ok(targetDoc);
    const originalAction = targetDoc.action;

    await AuditLog.updateOne(
      { _id: targetDoc._id },
      { $set: { action: 'UNAUTHORIZED_TAMPERED_ACTION' } }
    );

    // Re-verify: integrity check must catch the discrepancy!
    const verifyRes2 = await request(app)
      .get('/api/audit/verify')
      .set('Cookie', sessions.admin.cookieHeader);

    assert.strictEqual(verifyRes2.status, 200);
    assert.strictEqual(verifyRes2.body.verification.valid, false);
    assert.strictEqual(verifyRes2.body.verification.brokenSequence, 2);
    assert.match(verifyRes2.body.verification.details, /Payload integrity violation/i);

    // Restore original document to preserve chain integrity
    await AuditLog.updateOne(
      { _id: targetDoc._id },
      { $set: { action: originalAction } }
    );

    const verifyRes3 = await request(app)
      .get('/api/audit/verify')
      .set('Cookie', sessions.admin.cookieHeader);

    assert.strictEqual(verifyRes3.status, 200);
    assert.strictEqual(verifyRes3.body.verification.valid, true);
  });

  // TEST 16: Input Validation (Invalid MongoDB ObjectId Handling)
  await testStep('16. Input Validation (Malformed ObjectIds return 400 Bad Request)', async () => {
    const badId = 'not-a-valid-object-id';

    const getRes = await request(app)
      .get(`/api/accounts/${badId}`)
      .set('Cookie', sessions.admin.cookieHeader);
    assert.strictEqual(getRes.status, 400);
    assert.match(getRes.body.message, /Invalid account ID/i);

    const rotateRes = await request(app)
      .post(`/api/rotation/${badId}`)
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken);
    assert.strictEqual(rotateRes.status, 400);

    const requestRes = await request(app)
      .patch(`/api/requests/${badId}/approve`)
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken)
      .send({ approvalComment: 'Invalid ID test' });
    assert.strictEqual(requestRes.status, 400);
  });

  // TEST 17: Vault Health Monitoring Endpoint
  await testStep('17. Vault Health Monitoring (Honest reporting on Vault service status)', async () => {
    const res = await request(app)
      .get('/api/monitoring/vault-health')
      .set('Cookie', sessions.admin.cookieHeader);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.monitoring.vault.status);
    assert.strictEqual(res.body.monitoring.vault.sealed, false);
    assert.strictEqual(res.body.monitoring.vault.status, 'Healthy');
  });

  // TEST 18: Audit Log Password Redaction & Incident Lifecycle
  await testStep('18. Audit Log Zero-Password Redaction & Incident Management', async () => {
    // 18a: Verify zero passwords leaked in any audit metadata
    const auditRes = await request(app)
      .get('/api/audit')
      .set('Cookie', sessions.admin.cookieHeader);

    assert.strictEqual(auditRes.status, 200);
    assert.ok(auditRes.body.logs.length > 0);

    for (const log of auditRes.body.logs) {
      const metaStr = JSON.stringify(log.metadata || {});
      assert.strictEqual(metaStr.includes('InitialOraclePass!2026'), false);
      assert.strictEqual(metaStr.includes('AdminPassword!2026'), false);
    }

    // 18b: Create and Resolve Security Incident
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken)
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
      .set('Cookie', sessions.admin.cookieHeader)
      .set('X-CSRF-Token', sessions.admin.csrfToken)
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
