#!/bin/sh
set -e

export VAULT_ADDR=${VAULT_ADDR:-"http://127.0.0.1:8200"}
export VAULT_TOKEN=${VAULT_TOKEN:-${VAULT_DEV_ROOT_TOKEN_ID:-"root-master-token-vg2026"}}

echo "[Vault Init] Checking Vault status on ${VAULT_ADDR}..."
vault status || exit 1

echo "[Vault Init] Writing least-privilege policy: vaultguard-app..."
vault policy write vaultguard-app /vault/policies/vaultguard-app-policy.hcl

echo "[Vault Init] Enabling file audit device..."
mkdir -p /vault/logs
vault audit enable file file_path=/vault/logs/vault_audit.log 2>/dev/null || true

echo "[Vault Init] Minting restricted application identity token..."
APP_TOKEN=$(vault token create -policy=vaultguard-app -period=720h -field=token)
echo "[Vault Init] Restricted application token provisioned successfully."
echo "$APP_TOKEN" > /vault/logs/.app-token
