import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

// Ensure strong JWT secret without insecure fallbacks across ALL environments
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    'CRITICAL SECURITY CONFIGURATION ERROR: JWT_SECRET environment variable is missing or insecure. It must be explicitly configured with at least 32 characters across all environments.'
  );
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vaultguard',
  jwtSecret: jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  vaultAddr: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
  vaultAppToken: process.env.VAULT_APP_TOKEN || '',
  vaultKvMount: process.env.VAULT_KV_MOUNT || 'secret',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  vaultAuditLogPath:
    process.env.VAULT_AUDIT_LOG_PATH ||
    path.resolve(__dirname, '../../../vault/logs/vault_audit.log'),
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none',
};
