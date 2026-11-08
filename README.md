# VaultGuard – Privileged Access Management (PAM) System

> **Privileged Account Security & Access Governance Platform (Portfolio Project)**  
> *Secure Privileged Access. Maintain Complete Visibility.*

VaultGuard is a lightweight, local-first Privileged Access Management (PAM) application engineered to demonstrate practical knowledge of privileged account lifecycle management, hardware-grade secrets isolation with HashiCorp Vault KV v2, just-in-time (JIT) access request and approval governance, cryptographic credential rotation, Vault health telemetry, and tamper-evident audit logging with SHA-256 hash chaining.

The project models enterprise PAM design patterns inspired by enterprise platforms such as CyberArk (Digital Vault, CPM, PVWA governance workflows) without claiming to be a production CyberArk deployment.

---

## 1. System Architecture

```mermaid
flowchart TD
    subgraph Client["Presentation Layer (Port 5173)"]
        UI["React 18 + TypeScript + Vite + Tailwind CSS"]
        AuthContext["Auth Context (JWT via HTTP-only Cookies + CSRF)"]
        UI --> AuthContext
    end

    subgraph Backend["Application & PAM API Layer (Port 5000)"]
        Express["Express.js + TypeScript Engine"]
        RBAC["RBAC Middleware (ADMIN vs EMPLOYEE)"]
        Limiter["Rate Limiting & Helmet Security"]
        CSRF["Double-Submit Cookie CSRF Protection"]
        Zod["Zod Schema Validation"]
        RotationService["Vault KV v2 Rotation Engine"]
        IncidentEngine["Rule-Based Threat & Anomaly Detector"]
        AuditService["Tamper-Evident SHA-256 Hash-Chained Audit Ledger"]

        Express --> Limiter --> CSRF --> RBAC --> Zod
        Express --> RotationService
        Express --> IncidentEngine
        Express --> AuditService
    end

    subgraph Secrets["Secrets Management (Port 8200)"]
        Vault["HashiCorp Vault Community Edition"]
        KV2["KV Secrets Engine v2 (secret/data/accounts/*)"]
        Policy["Restricted App Policy (vaultguard-app)"]
        AuditDev["Vault File Audit Device (HMAC Hashed by Vault)"]
        
        Vault --- KV2
        Vault --- Policy
        Vault --- AuditDev
    end

    subgraph Data["Metadata Storage (Port 27017)"]
        MongoDB[("MongoDB Database (vaultguard)")]
        UsersCol["Users Collection (bcrypt)"]
        AccountsCol["Privileged Accounts (Secret Paths only)"]
        GrantsCol["Access Grants (Time-Bounded Leases)"]
        IncidentsCol["Incidents (Forensic Notes)"]
        AuditCol["Audit Log Ledger (SHA-256 Hash Chained)"]

        MongoDB --- UsersCol
        MongoDB --- AccountsCol
        MongoDB --- GrantsCol
        MongoDB --- IncidentsCol
        MongoDB --- AuditCol
    end

    AuthContext <--> Express
    Express <-->|"Vault REST API (Restricted App Token)"| Vault
    Express <-->|"Mongoose ODM (No Cleartext Passwords)"| MongoDB
```

---

## 2. Core Security & Architectural Principles

1. **Zero Cleartext Secret Persistence in MongoDB**:
   - The application database (`MongoDB`) strictly stores account metadata, ownership, target hostnames, and the Vault reference path (`accounts/acc_<id>`).
   - Plaintext passwords and Vault root tokens are **never** stored in MongoDB. Credentials (target username and decrypted password) are returned **strictly through the authorized, time-bounded credential checkout endpoint** (`POST /api/accounts/:id/retrieve`) upon verification of an active grant and approved access request. General account list, metadata, audit, and user profile endpoints never expose credentials.
2. **Fail-Closed Architecture**:
   - If HashiCorp Vault is unreachable, sealed, or reports degraded status, credential retrievals and account onboards **immediately fail closed** (returning HTTP 503). Under no circumstances are fallback plaintext stores used.
3. **Dual-Custody & Self-Approval Prevention**:
   - Administrators cannot approve their own privileged access requests. Approvals require an independent administrator review.
4. **Server-Enforced Access Grants**:
   - Temporary access grants expire automatically on the backend server. Even if a client bypasses UI timers, the server enforces strict timestamp and revocation checks before contacting Vault.
5. **Tamper-Evident SHA-256 Hash Chaining (Scope & Boundaries)**:
   - Application audit logs are cryptographically linked in a sequential SHA-256 hash chain from Genesis (`0000...0000`).
   - The mechanism is **tamper-evident** (not immutable or tamper-proof): any retroactive modification, reordering, or individual deletion breaks chain verification and is flagged by `GET /api/audit/verify`.
   - Complete chain rewriting or tail truncation cannot be detected without external cryptographic anchoring (e.g., public timestamping, external blockchain, or remote witness services).
   - Separate Vault Audit Device: HashiCorp Vault independently logs its own API interactions via a file audit device using internal HMAC hashing.
6. **Credential Redaction**:
   - The audit service automatically scrubs and redacts fields containing `password`, `token`, `secret`, `credential`, `hash`, `cookie`, `auth`, or `private` before recording events.

---

## 3. Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide React, Axios, React Router v7.
- **Backend**: Node.js v24, Express 4, TypeScript, JWT (HTTP-Only Secure Cookies), bcrypt (10 rounds), Zod validation, Helmet, Express Rate Limit.
- **Database**: MongoDB 8.x with Mongoose ODM (strictly object references and schemas, bound to 127.0.0.1).
- **Secrets Engine**: HashiCorp Vault Community Edition (v1.15.6), KV Secrets Engine Version 2, custom ACL policy (`vaultguard-app`), file audit device (bound to 127.0.0.1).
- **Local Development**: Docker Compose & native services.

---

## 4. Synthetic Demonstration Identity & Roles

> **NOTE:** All users, hostnames, IP addresses (`10.0.x.x`), and credentials listed below are **synthetic demonstration data** for isolated local portfolio evaluation only.

| Role | Name | Email | Synthetic Demonstration Responsibility |
| :--- | :--- | :--- | :--- |
| **ADMIN** | Alexander Vance | `admin@vaultguard.local` | Principal Security Administrator: PAM governance, HashiCorp Vault management, approvals, credential rotation, forensic investigation |
| **EMPLOYEE** | Sarah Jenkins | `employee@vaultguard.local` | Senior Systems Engineer: Infrastructure operations, JIT access requests, authorized credential checkout |
| **EMPLOYEE** | David Kim | `developer@vaultguard.local` | Database Reliability Engineer: Scoped resource access, credential checkout |

---

## 5. Deployment & Execution Instructions

### Option A: Using Docker Compose (Staged Startup Process)

Docker services bind strictly to `127.0.0.1` on the host. Vault dev mode and unauthenticated MongoDB are scoped for isolated local development only.

```bash
# 1. Copy the root environment template
cp .env.example .env

# 2. Stage 1: Start MongoDB and HashiCorp Vault
docker compose up -d mongodb vault

# 3. Stage 2: Initialize Vault policy, file audit device, and mint application token
./vault/scripts/init-vault.sh "<VAULT_DEV_ROOT_TOKEN_ID_FROM_ENV>"
# (On Windows PowerShell: .\vault\scripts\init-vault.ps1 -VaultRootToken "<VAULT_DEV_ROOT_TOKEN_ID_FROM_ENV>")

# 4. Stage 3: Set the minted token in .env as VAULT_APP_TOKEN=<token>

# 5. Stage 4: Start Backend and Frontend
docker compose up -d backend frontend
```
cd backend
npm install
npm run seed
npm run dev

# In a separate terminal, install & start Frontend
cd ../frontend
npm install
npm run dev
```

### Option B: Native Services (Currently Running on this Host)
- **MongoDB**: Running on `mongodb://127.0.0.1:27017/vaultguard`
- **HashiCorp Vault**: Running on `http://127.0.0.1:8200`
- **Backend API**: Running on `http://localhost:5000`
- **Frontend Portal**: Running on `http://localhost:5173`

---

## 6. Automated Verification Suite (28 Integration Scenarios)

The project includes an end-to-end integration test suite (`backend/src/tests/pam.test.ts`) covering all 28 security, governance, concurrency, and validation scenarios:

```bash
cd backend
npm test
```

### Verified Test Results:
```text
============================================================
   VAULTGUARD PAM SYSTEM - AUTOMATED INTEGRATION TESTS      
============================================================

[Database] MongoDB connected successfully to mongodb://127.0.0.1:27017/vaultguard
[PASS] 1. Successful Login & Cookie-Only JWT Auth (Admin, Employee, Developer)
[PASS] 2. Invalid Login (Bad Credentials Rejected)
[PASS] 3. CSRF Protection (State-changing cookie request without X-CSRF-Token blocked)
[PASS] 4. Role-Based Access Control (Employee accessing admin-only endpoint blocked)
[PASS] 5. Account Onboarding (Metadata stored in MongoDB, credential in Vault KV v2)
[PASS] 6. Vault Secret Storage Verification (Credential verified directly in KV v2)
[PASS] 7. Unauthorized Credential Retrieval (Employee without active grant blocked)
[PASS] 8. Access Request Submission (Employee submits request with business justification)
[PASS] 9. Access Request Approval & Self-Approval Prevention
[PASS] 10. Authorized Credential Retrieval (Employee retrieves with active grant)
[PASS] 11. Access Request Rejection (Admin rejects request)
[PASS] 12. Expired Access Denial (Server-side expiry check fails closed)
[PASS] 13. Revoked Access Denial (Admin explicitly revokes grant)
[PASS] 14. Credential Rotation (Vault KV v2 secret rotated; Target OS honestly reported)
[PASS] 15. Tamper-Evident Audit Log Integrity Verification & Tamper Detection
[PASS] 16. Input Validation (Malformed ObjectIds return 400 Bad Request)
[PASS] 17. Vault Health Monitoring (Honest reporting on Vault service status)
[PASS] 18. Audit Log Zero-Password Redaction & Incident Management
[PASS] 19. Independent Audit Field Tampering Detection (userId & ipAddress)
[PASS] 20. Intra-Process Concurrency in Audit Logging (Parallel writes in single Node process preserve chain)
[PASS] 21. Audit Persistence Failure & Observable Error Propagation
[PASS] 22. Access Request Review Input Validation (Invalid body rejected with 400)
[PASS] 23. Concurrent Approval Conflict Handling (Atomic state transition)
[PASS] 24. Approval State-Transition Compensation Rollback on Grant Failure
[PASS] 25. Real Monitoring Metadata (Actual Vault telemetry returned)
[PASS] 26. Audit Failure During Approval Triggers Compensation Rollback
[PASS] 27. Rollback Failure Triggers Critical Security Incident & Fails Closed
[PASS] 28. Orphan Grant Rejection (Credential checkout denied if request is not Approved)

------------------------------------------------------------
SUMMARY: 28 PASSED, 0 FAILED out of 28 tests.
------------------------------------------------------------
```

---

## 7. Operational Workflow Scenarios

### SCENARIO 1: Administrator Registers a Privileged Account
1. Sign in as Administrator (`admin@vaultguard.local` / `AdminPassword!2026`).
2. Navigate to **Credential Vault** and select **Onboard Privileged Account**.
3. Register the target account (e.g. `PROD-DC01-AD`, `corp.admin`, `Windows Administrator`, `10.0.10.15`).
4. Confirm that the account appears in the inventory table. Inspect MongoDB to confirm that only `vaultSecretPath` is stored—the actual password resides strictly within HashiCorp Vault KV v2.

### SCENARIO 2: Systems Engineer Requests Privileged Access
1. Sign in as Systems Engineer (`employee@vaultguard.local` / `EmployeePassword!2026`).
2. Navigate to **Credential Vault**.
3. Select an ungranted asset (e.g. `K8S-MASTER-CORE01`) and select **Request Access**.
4. Enter business justification: *"RFC-2026-4412: Urgent mitigation of OpenSSL vulnerability CVE-2026-2184 on production master node"* and select **60 minutes**.
5. Submit the request. Navigate to **Access Requests** to verify status: `Pending Review`.

### SCENARIO 3: Administrator Approves Request & Enforces Dual Custody
1. Log back in as Administrator (`admin@vaultguard.local`).
2. Navigate to **Access Requests**. View Sarah Jenkins's request.
3. Select **Approve**, enter reviewer comment, and confirm.
4. Verify that self-approval is rejected if the administrator attempts to approve an account they requested themselves.

### SCENARIO 4: Systems Engineer Retrieves Authorized Credential
1. Switch back to Sarah Jenkins (`employee@vaultguard.local`).
2. In **Credential Vault**, the action button has updated to **Check Out**.
3. Select **Check Out**. The **Privileged Credential Retrieval Modal** opens:
   - Displays live credential decrypted from Vault KV v2.
   - Shows active grant expiration timestamp.
   - Active 60-second auto-clearing memory timer.
   - One-click copy with clipboard clearing.

### SCENARIO 5: Unauthorized Access Denied
1. Sign in as Developer (`developer@vaultguard.local` / `DevPassword!2026`).
2. Attempt direct checkout or API call on `PROD-DC01-AD`.
3. The server rejects the attempt with HTTP 403: *"Access Denied: You do not have an approved access grant for this privileged account."*
4. Confirm that an audit denial record is immediately written to the audit log.

### SCENARIO 6: Audit Logs Record Complete Trail
1. Sign in as Administrator.
2. Navigate to **Audit Logs**.
3. Inspect immutable log entries for: Login, Account Onboarding, Access Request, Approval, Credential Retrieved, and Credential Retrieval Denied.
4. Select **Export CSV Report** to download the compliance audit ledger.

### SCENARIO 7: Administrator Investigates Security Incident
1. Select **Incidents**.
2. Open an incident flagged by the rule-based detection engine (e.g. repeated unauthorized retrieval attempts or rotation failure).
3. Select **Investigate**. Add forensic notes to the incident timeline.
4. Enter remediation summary and select **Resolve & Close Incident**.

### SCENARIO 8: Cryptographic Credential Rotation
1. Navigate to **Credential Rotation**.
2. Select target account `PROD-DC01-AD` and select **Execute Rotation**.
3. The system generates a 24-character high-entropy cryptographic password, writes a new version to HashiCorp Vault KV v2, verifies the secret, and logs the reconciliation record.
4. Enable **"Enforce strict host agent verification"** to demonstrate failure handling and automated incident creation.

### SCENARIO 9: Vault Health & Seal Status
1. Navigate to **Monitoring**.
2. Inspect live telemetry: Shamir seal status, restricted app token validity, physical audit log file size, and 24-hour access attempt rates.
3. Select **Poll Health Now** to verify real-time responsiveness.

---

## 8. API Specification

| Method | Endpoint | Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticates user and issues HTTP-only cookie + JWT |
| `POST` | `/api/auth/logout` | Authenticated | Clears session cookie and records audit log |
| `GET` | `/api/auth/me` | Authenticated | Returns current authenticated profile and role |
| `GET` | `/api/accounts` | Authenticated | Lists privileged accounts (metadata only) |
| `POST` | `/api/accounts` | ADMIN | Onboards account & writes secret to Vault KV v2 |
| `GET` | `/api/accounts/:id` | Authenticated | Retrieves account metadata |
| `PUT` | `/api/accounts/:id` | ADMIN | Updates account metadata (or updates Vault password) |
| `DELETE` | `/api/accounts/:id` | ADMIN | Deletes metadata and purges Vault secret |
| `POST` | `/api/accounts/:id/retrieve` | Authenticated | Validates active grant and retrieves secret from Vault |
| `POST` | `/api/requests` | Authenticated | Submits just-in-time access request |
| `GET` | `/api/requests` | ADMIN | Lists all access requests |
| `GET` | `/api/requests/my` | Authenticated | Lists requester's access requests and active grants |
| `PATCH` | `/api/requests/:id/approve` | ADMIN | Approves request and creates timed `AccessGrant` |
| `PATCH` | `/api/requests/:id/reject` | ADMIN | Rejects access request with explanation |
| `PATCH` | `/api/requests/:id/revoke` | ADMIN | Immediately revokes active access grant |
| `POST` | `/api/rotation/:accountId` | ADMIN | Rotates credential in Vault and reconciles |
| `GET` | `/api/rotation/history` | ADMIN | Returns rotation history records |
| `GET` | `/api/monitoring/vault-health` | ADMIN | Live Vault engine health, seal status & telemetry |
| `GET` | `/api/monitoring/events` | ADMIN | Recent security denial and error events |
| `GET` | `/api/incidents` | ADMIN | Queries security incidents |
| `POST` | `/api/incidents` | ADMIN | Registers manual security incident |
| `PATCH` | `/api/incidents/:id` | ADMIN | Appends notes and updates incident severity |
| `PATCH` | `/api/incidents/:id/resolve` | ADMIN | Resolves security incident with remediation notes |
| `GET` | `/api/audit` | ADMIN | Filtered audit query |
| `GET` | `/api/audit/verify` | ADMIN | Cryptographic SHA-256 hash chain integrity verification |
| `GET` | `/api/audit/export` | ADMIN | Exports audit ledger to CSV format |
| `GET` | `/api/dashboard/summary` | Authenticated | Computes high-level PAM KPIs from live database |
| `GET` | `/api/dashboard/recent-activity` | Authenticated | Fetches recent audit events and open incidents |

---

## 9. Implementation Scope & Architectural Limitations

1. **Vault Secret Rotation vs. Target OS Reconciliation**:
   - **Implemented**: VaultGuard generates cryptographically secure 32-character passwords, writes new secret versions to HashiCorp Vault KV v2, verifies the secret write, and records rotation history.
   - **Out of Scope (Honest Disclosure)**: VaultGuard does not deploy local host agents or establish remote network connections (SSH/WMI/RPC/LDAP) to change passwords directly on target Windows Domain Controllers or Linux hosts. The application explicitly flags `targetStatus: 'NOT_IMPLEMENTED'` and `targetPasswordChanged: false`.
2. **Audit Hash Chain Scope**:
   - The SHA-256 hash chaining mechanism provides robust tamper-evidence for historical records stored in the application database. An attacker or malicious administrator cannot alter, reorder, or delete past audit logs without breaking the chain.
   - It is an application-level hash chain; it does not replace distributed Byzantine consensus or write-once optical media (WORM storage). For independent operational logging, HashiCorp Vault's file audit device records HMAC-hashed API events to `/vault/logs/vault_audit.log`.
3. **Database Concurrency & Transactions**:
   - State transitions (such as access approvals) use atomic MongoDB operations (`findOneAndUpdate` with state checks) and compensation rollbacks. In standalone local MongoDB instances (without a replica set), multi-document ACID transactions are not enabled; the application employs automatic compensation logic to revert request states if grant issuance or audit logging fails.
4. **Local-First & Serverless Deployment Readiness**:
   - Designed for local execution, portfolio demonstration, and security evaluation via Docker or native services, and fully prepared for production serverless deployment on Vercel using two decoupled projects (Frontend SPA and Serverless Express API) communicating over a same-origin reverse proxy.

---

## 10. Vercel Deployment Guide (Serverless Architecture)

VaultGuard is pre-configured for seamless production deployment on **Vercel** as two decoupled projects originating from the same GitHub repository (`https://github.com/Adarsh048/VaultGuard`).

### 10.1 Architecture Overview

```mermaid
flowchart LR
    Browser["Client Browser"]
    subgraph Vercel["Vercel Cloud Platform"]
        Frontend["Project A: VaultGuard Frontend\n(Vite SPA + Same-Origin Proxy)"]
        Backend["Project B: VaultGuard Backend\n(Serverless Node.js Function)"]
    end
    subgraph External["External Managed Services"]
        Atlas[("MongoDB Atlas\n(Encrypted Database)")]
        Vault["HashiCorp Vault\n(Remote HTTPS Endpoint)"]
    end

    Browser -->|"HTTPS (Same-Origin)"| Frontend
    Frontend -->|"Rewrite /api/* to backend"| Backend
    Backend -->|"Mongoose TLS (Connection Cached)"| Atlas
    Backend -->|"REST API over HTTPS (App Token)"| Vault
```

- **Same-Origin API Proxy**: `frontend/vercel.json` proxies all `/api/:path*` requests directly to the deployed backend URL. This ensures `SameSite=Lax` and `HttpOnly` security cookies (`vaultguard_token`, `vaultguard_csrf`) are set on the frontend domain without third-party cookie restrictions or cross-origin issues.
- **Serverless Connection Caching**: `backend/src/config/database.ts` uses a global Mongoose connection cache (`global.mongooseCache`) to reuse active database sockets across warm lambda invocations and prevent connection exhaustion on MongoDB Atlas.
- **Fail-Closed Production Guardrails**: `backend/src/config/env.ts` enforces non-localhost Atlas URIs, strictly HTTPS Vault endpoints, minimum 32-character JWT secrets, and prohibits synthetic data seeding in production.

---

### 10.2 External Services Setup (Prerequisites & Network Security)

#### 1. MongoDB Atlas Setup & Network Access Control

> [!WARNING]
> **Enterprise Security Warning on IP Allowlisting (`0.0.0.0/0`)**:
> Opening MongoDB Atlas to `0.0.0.0/0` (Anywhere) allows connection attempts to port 27017 from the public internet. This must **never** be used in enterprise production environments.

##### Production Network Allowlisting Strategies (Vercel Outbound IPs)
Standard Vercel Serverless Functions execute on dynamic multi-tenant AWS Lambda pools with rotating outbound IP addresses. For production environments, employ one of the following architectures:

1. **Vercel Secure Compute (Recommended for Enterprise)**:
   - Assigns dedicated egress IP addresses and dedicated VPC networking to Vercel projects.
   - Add the provisioned static egress IPs directly to the MongoDB Atlas **Network Access** IP Access List.
2. **Static Egress Proxy**:
   - Route outbound database connections through a dedicated static NAT proxy (e.g. QuotaGuard Static or an AWS NAT Gateway).
   - Allowlist only the proxy's fixed static IP addresses in Atlas.
3. **AWS VPC Peering / AWS PrivateLink**:
   - If hosting on a dedicated Atlas tier (M10+) and AWS infrastructure, configure VPC Peering or AWS PrivateLink to keep all traffic private without public IP traversal.

##### Temporary Demo-Only Alternative (Portfolio / Evaluation Setup)
If evaluating this project on free/hobby tiers where dedicated static egress IPs are unavailable:
- You may temporarily permit access in **Network Access** (`0.0.0.0/0`) for the duration of the evaluation.
- **Mandatory Compensating Controls**:
  - Enforce SCRAM-SHA-256 database authentication with a $\ge 32$-character high-entropy cryptographic password.
  - Create a least-privilege database user restricted strictly to `readWrite` on the `vaultguard` database (zero `dbAdmin`, `clusterAdmin`, or `atlasAdmin` permissions).
  - Enable MongoDB Atlas multi-factor authentication (MFA) on all administrator accounts.
  - Remove `0.0.0.0/0` immediately after evaluation concludes.

Copy the Atlas SRV connection string:
```text
mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/vaultguard?retryWrites=true&w=majority
```

---

#### 2. Remote HashiCorp Vault Setup (AppRole Authentication)

Because HashiCorp Vault is a persistent cryptographic service, it must run on a persistent HTTPS endpoint (e.g. [HashiCorp Cloud Platform (HCP) Vault](https://cloud.hashicorp.com/products/vault), Fly.io, Railway, or a hardened VPS with TLS).

##### Step A: Enable AppRole Authentication (Serverless-Compatible)
Serverless functions spin down and freeze execution context, making long-lived static tokens vulnerable to silent expiration without background renewal. VaultGuard implements **Vault AppRole Authentication** with short-lived (1-hour) tokens, automated proactive renewal, and re-authentication on expiration.

1. Ensure Vault has KV v2 enabled at `secret/`.
2. Apply the `vaultguard-app` policy (`vault/policies/vaultguard-app-policy.hcl`):
   ```bash
   vault policy write vaultguard-app vault/policies/vaultguard-app-policy.hcl
   ```
3. Enable the AppRole auth method:
   ```bash
   vault auth enable approle
   ```
4. Configure the `vaultguard-role`:
   ```bash
   vault write auth/approle/role/vaultguard-role \
     token_policies="vaultguard-app" \
     token_ttl="1h" \
     token_max_ttl="24h" \
     secret_id_ttl="720h"
   ```
5. Retrieve the static `role_id`:
   ```bash
   vault read -field=role_id auth/approle/role/vaultguard-role/role-id
   ```
6. Mint a `secret_id` (record securely; never commit or expose to frontend):
   ```bash
   vault write -f -field=secret_id auth/approle/role/vaultguard-role/secret-id
   ```

##### Alternative (Static Token Fallback)
For local development or persistent container environments, you may alternatively generate a periodic token:
```bash
vault token create -policy=vaultguard-app -period=720h -orphan -display-name="vaultguard-prod-api"
```
> [!NOTE]
> In serverless production, **AppRole authentication (`VAULT_ROLE_ID` and `VAULT_SECRET_ID`) is strongly recommended**. If a periodic token is used without an active daemon process to renew it, it will expire after 720 hours of inactivity.

---

### 10.3 Project Deployment on Vercel

Import the repository (`https://github.com/Adarsh048/VaultGuard`) twice in the [Vercel Dashboard](https://vercel.com/new).

#### Step 1: Deploy Backend (Project B)
1. In Vercel, select **Add New Project** and choose `VaultGuard`.
2. Configure **Project Settings**:
   - **Project Name**: `vaultguard-api` (or preferred name)
   - **Root Directory**: Click *Edit* and select `backend`
   - **Framework Preset**: `Other`
   - **Build Command**: *(leave empty / default)*
   - **Output Directory**: *(leave empty / default)*
3. Configure **Environment Variables**:
   | Variable | Value | Description |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Enables strict production security mode |
   | `JWT_SECRET` | *(Random 32+ character string)* | Signs and verifies user authentication tokens |
   | `JWT_EXPIRES_IN` | `8h` | Token expiration duration |
   | `MONGO_URI` | `mongodb+srv://...` | MongoDB Atlas remote connection string |
   | `VAULT_ADDR` | `https://vault.yourdomain.com:8200` | Remote HTTPS HashiCorp Vault address |
   | `VAULT_ROLE_ID` | `<approle-role-id>` | **(Recommended)** AppRole Role ID for auto-renewing tokens |
   | `VAULT_SECRET_ID` | `<approle-secret-id>` | **(Recommended)** AppRole Secret ID |
   | `VAULT_APP_TOKEN` | `<restricted-app-token>` | *(Fallback if AppRole not used)* |
   | `VAULT_KV_MOUNT` | `secret` | Vault KV v2 mount path |
   | `CORS_ORIGIN` | `https://vaultguard-web.vercel.app` | Frontend production origin (update after Step 2) |
   | `COOKIE_SAMESITE` | `lax` | Cookie SameSite attribute |
4. Click **Deploy**. Note the assigned backend URL (e.g., `https://vaultguard-api.vercel.app`).

---

#### Step 2: Deploy Frontend (Project A)
1. In `frontend/vercel.json`, update the rewrite destination URL with your deployed backend address:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://vaultguard-api.vercel.app/api/:path*"
       },
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```
2. In Vercel, select **Add New Project** and choose `VaultGuard`.
3. Configure **Project Settings**:
   - **Project Name**: `vaultguard-web`
   - **Root Directory**: Click *Edit* and select `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Configure **Environment Variables**:
   *(No required variables: the frontend communicates with `/api` through the same-origin Vercel rewrite proxy).*
5. Click **Deploy**. Note the assigned frontend URL (e.g., `https://vaultguard-web.vercel.app`).
6. *(Post-Deployment Alignment)*: Return to Project B (**vaultguard-api**) -> **Settings** -> **Environment Variables**, ensure `CORS_ORIGIN` matches your production frontend URL (`https://vaultguard-web.vercel.app`), and redeploy if needed.

---

### 10.4 Production Health Checks & Monitoring Probes

VaultGuard separates process liveness from external dependency readiness:

1. **Liveness Probe (`GET /api/health/live`)**:
   - Verifies the Node.js / Express serverless container is alive and responding to event loops.
   - Returns HTTP 200:
     ```json
     { "status": "UP", "check": "liveness", "uptimeSeconds": 142, "service": "VaultGuard PAM API" }
     ```
2. **Readiness Probe (`GET /api/health/ready` or `GET /api/health`)**:
   - Actively probes MongoDB connectivity (`ping` command) and HashiCorp Vault health (`/v1/sys/health`).
   - If all dependencies are healthy, returns HTTP 200:
     ```json
     {
       "status": "UP",
       "check": "readiness",
       "service": "VaultGuard PAM API",
       "dependencies": {
         "database": { "status": "UP", "type": "MongoDB", "connected": true, "latencyMs": 4 },
         "vault": { "status": "UP", "initialized": true, "sealed": false, "version": "1.15.6", "latencyMs": 7 }
       }
     }
     ```
   - If MongoDB is disconnected or Vault is sealed/unreachable, **returns HTTP 503 (Service Unavailable)** with honest dependency breakdown so external monitoring alerts immediately.

---

### 10.5 Deployment Verification Matrix

| Verification Area | Local / Preview Status | Production Cloud Status |
| :--- | :--- | :--- |
| **Frontend Production Build** | Verified (`tsc && vite build` $\to$ `dist/` 0 errors) | Ready for Vercel deployment |
| **Backend Production Build** | Verified (`tsc` $\to$ `dist/` 0 errors) | Ready for Vercel deployment |
| **PAM Integration Suite** | Verified (32 / 32 tests passed) | Functional test suite validated |
| **Serverless Function Routing** | Verified (`backend/src/handler.ts` + `api/index.ts` handler tests) | Routes, verbs, headers, cookies compatible |
| **Vault AppRole Lifecycle** | Verified (Token acquisition, KV read/write, renewal, expiry refresh) | Requires remote Vault endpoint with AppRole |
| **Health Checks (Live vs Ready)** | Verified (200 on healthy; 503 on degraded Vault) | Ready for external uptime monitoring |
| **Database Connection Caching** | Verified (`global.mongooseCache` prevents connection storms) | Requires MongoDB Atlas SRV URI |
| **Live Vercel Deployment** | Pending user deployment initiation | Instructions provided below |
