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

echo "[Vault Init] Enabling file audit device..."
mkdir -p /vault/logs
vault audit enable file file_path=/vault/logs/vault_audit.log 2>/dev/null || true

echo "[Vault Init] Minting restricted application identity token (policy=vaultguard-app, ttl=720h)..."
APP_TOKEN=$(vault token create -policy=vaultguard-app -period=720h -field=token)
echo "[Vault Init] Restricted application token provisioned successfully."
echo "[Vault Init] ACTION REQUIRED: Set VAULT_APP_TOKEN in backend/.env with the generated token."
echo "[Vault Init] Note: Root token has NOT been saved to disk or application directories."
