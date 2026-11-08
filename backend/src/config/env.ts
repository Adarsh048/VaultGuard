import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vaultguard',
  jwtSecret: process.env.JWT_SECRET || 'vaultguard-default-secret-key-change-in-prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  vaultAddr: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
  vaultAppToken: process.env.VAULT_APP_TOKEN || '',
  vaultKvMount: process.env.VAULT_KV_MOUNT || 'secret',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

