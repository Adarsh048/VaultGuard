import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// 1. Mandatory JWT Secret validation across ALL environments
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    'CRITICAL SECURITY CONFIGURATION ERROR: JWT_SECRET environment variable is missing or insecure. It must be explicitly configured with at least 32 characters across all environments.'
  );
}

// 2. Strict Production Environment Validations
const mongoUri = process.env.MONGO_URI;
if (isProduction) {
  if (!mongoUri || mongoUri.trim() === '') {
    throw new Error(
      'CRITICAL SECURITY CONFIGURATION ERROR: MONGO_URI is mandatory in production. Configure a production MongoDB Atlas connection string.'
    );
  }
  const lowerMongo = mongoUri.toLowerCase();
  if (lowerMongo.includes('localhost') || lowerMongo.includes('127.0.0.1')) {
    throw new Error(
      'CRITICAL SECURITY CONFIGURATION ERROR: MONGO_URI points to localhost/127.0.0.1. A remote managed database (e.g. MongoDB Atlas) is required in production.'
    );
  }
}

const vaultAddr = process.env.VAULT_ADDR;
if (isProduction) {
  if (!vaultAddr || vaultAddr.trim() === '') {
    throw new Error(
      'CRITICAL SECURITY CONFIGURATION ERROR: VAULT_ADDR is mandatory in production. Configure a remote HTTPS HashiCorp Vault endpoint.'
    );
  }
  if (!vaultAddr.startsWith('https://')) {
    throw new Error(
      'CRITICAL SECURITY CONFIGURATION ERROR: VAULT_ADDR must use HTTPS protocol in production. Plain HTTP is strictly forbidden.'
    );
  }
  const lowerVault = vaultAddr.toLowerCase();
  if (lowerVault.includes('localhost') || lowerVault.includes('127.0.0.1')) {
    throw new Error(
      'CRITICAL SECURITY CONFIGURATION ERROR: VAULT_ADDR points to localhost/127.0.0.1. A remote managed Vault service is required in production.'
    );
  }
}

const vaultAppToken = process.env.VAULT_APP_TOKEN || '';
const vaultRoleId = process.env.VAULT_ROLE_ID || '';
const vaultSecretId = process.env.VAULT_SECRET_ID || '';

if (isProduction) {
  const hasAppRole = Boolean(vaultRoleId.trim() && vaultSecretId.trim());
  const hasToken = Boolean(vaultAppToken.trim());
  if (!hasAppRole && !hasToken) {
    throw new Error(
      'CRITICAL SECURITY CONFIGURATION ERROR: Vault authentication is not configured in production. Configure either AppRole credentials (VAULT_ROLE_ID and VAULT_SECRET_ID) or a restricted VAULT_APP_TOKEN.'
    );
  }
}

const corsOrigin = process.env.CORS_ORIGIN;
if (isProduction && (!corsOrigin || corsOrigin.trim() === '')) {
  throw new Error(
    'CRITICAL SECURITY CONFIGURATION ERROR: CORS_ORIGIN is mandatory in production. Configure the frontend Vercel origin.'
  );
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  mongoUri: mongoUri || 'mongodb://127.0.0.1:27017/vaultguard',
  jwtSecret: jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  vaultAddr: vaultAddr || 'http://127.0.0.1:8200',
  vaultAppToken: vaultAppToken,
  vaultRoleId: vaultRoleId,
  vaultSecretId: vaultSecretId,
  vaultKvMount: process.env.VAULT_KV_MOUNT || 'secret',
  corsOrigin: corsOrigin || 'http://localhost:5173',
  vaultAuditLogPath: process.env.VAULT_AUDIT_LOG_PATH
    ? process.env.VAULT_AUDIT_LOG_PATH
    : isProduction
      ? null
      : path.resolve(__dirname, '../../../vault/logs/vault_audit.log'),
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none',
};
