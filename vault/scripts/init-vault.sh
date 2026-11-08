#!/bin/sh
set -e

export VAULT_ADDR=${VAULT_ADDR:-"http://127.0.0.1:8200"}
export VAULT_TOKEN=${VAULT_DEV_ROOT_TOKEN_ID:-"root-master-token-vg2026"}

echo "Initializing VaultGuard policies and secrets engine..."
vault status || exit 1

# Write policy
vault policy write vaultguard-app /vault/policies/vaultguard-app-policy.hcl

# Enable audit device
mkdir -p /vault/logs
vault audit enable file file_path=/vault/logs/vault_audit.log || true

# Generate restricted app token
APP_TOKEN=$(vault token create -policy=vaultguard-app -period=720h -field=token)
echo "Restricted App Token: $APP_TOKEN"

