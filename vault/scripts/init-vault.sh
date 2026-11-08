#!/bin/sh
set -e

export VAULT_ADDR=${VAULT_ADDR:-"http://127.0.0.1:8200"}
ADMIN_TOKEN=${1:-${VAULT_TOKEN}}

if [ -z "$ADMIN_TOKEN" ]; then
  echo "[Vault Init ERROR] Explicit Vault administrative credentials required." >&2
  echo "Usage: ./init-vault.sh <VAULT_ADMIN_ROOT_TOKEN> or set VAULT_TOKEN environment variable." >&2
  exit 1
fi

export VAULT_TOKEN="$ADMIN_TOKEN"

echo "[Vault Init] Checking Vault status on ${VAULT_ADDR}..."
vault status || exit 1

echo "[Vault Init] Writing least-privilege policy: vaultguard-app..."
vault policy write vaultguard-app /vault/policies/vaultguard-app-policy.hcl

echo "[Vault Init] Configuring file audit device..."
mkdir -p /vault/logs
if vault audit list -format=json 2>/dev/null | grep -q '"file/"'; then
  echo "[Vault Init] Audit device 'file/' is already enabled."
else
  vault audit enable file file_path=/vault/logs/vault_audit.log
fi

echo "[Vault Init] Configuring AppRole authentication method..."
if vault auth list -format=json 2>/dev/null | grep -q '"approle/"'; then
  echo "[Vault Init] Auth method 'approle/' is already enabled."
else
  vault auth enable approle
fi

echo "[Vault Init] Configuring AppRole role: vaultguard-role..."
vault write auth/approle/role/vaultguard-role \
  token_policies="vaultguard-app" \
  token_ttl="1h" \
  token_max_ttl="24h" \
  secret_id_ttl="720h"

ROLE_ID=$(vault read -field=role_id auth/approle/role/vaultguard-role/role-id)
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/vaultguard-role/secret-id)

echo "[Vault Init] AppRole configured successfully."
echo "[Vault Init] ROLE_ID: $ROLE_ID"
echo "[Vault Init] Minted SECRET_ID (expires in 720h, single-role)."
echo "[Vault Init] ACTION REQUIRED: For serverless / production, set VAULT_ROLE_ID and VAULT_SECRET_ID in backend/.env"

echo "[Vault Init] Minting backup restricted application token (policy=vaultguard-app, period=720h)..."
APP_TOKEN=$(vault token create -policy=vaultguard-app -period=720h -field=token)
echo "[Vault Init] Restricted application token provisioned successfully."
echo "[Vault Init] Note: Root token has NOT been saved to disk or application directories."
