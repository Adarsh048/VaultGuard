import app from './app';
import { config } from './config/env';
import { connectDatabase } from './config/database';
import { vaultService } from './services/vault.service';

async function startServer() {
  console.log('--- Starting VaultGuard Privileged Access Management System ---');
  
  // Connect to Database
  await connectDatabase();

  // Check Vault connectivity
  const vaultHealth = await vaultService.getHealth();
  console.log(`[Vault] Health Status: ${vaultHealth.statusText} | Sealed: ${vaultHealth.sealed}`);
  if (vaultHealth.statusText === 'Unavailable') {
    console.warn('[Vault] Warning: HashiCorp Vault is not reachable. Ensure Vault is running on ' + config.vaultAddr);
  }

  // Start HTTP Listener
  const server = app.listen(config.port, () => {
    console.log(`[Server] VaultGuard Backend API listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    console.log('[Server] Gracefully shutting down...');
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

