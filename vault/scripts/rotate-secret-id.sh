#!/bin/sh
# ==============================================================================
# VaultGuard - AppRole SecretID Zero-Downtime Rotation Helper
# ==============================================================================
# Generates a new SecretID for the vaultguard-role without invalidating
# the existing SecretID immediately, enabling zero-downtime rotation.
# ==============================================================================
set -e

export VAULT_ADDR=${VAULT_ADDR:-"http://127.0.0.1:8200"}
ADMIN_TOKEN=${1:-${VAULT_TOKEN}}

if [ -z "$ADMIN_TOKEN" ]; then
  echo "[SecretID Rotation ERROR] Explicit Vault administrative credentials required." >&2
  echo "Usage: ./rotate-secret-id.sh <VAULT_ADMIN_ROOT_TOKEN> or set VAULT_TOKEN environment variable." >&2
  exit 1
fi

export VAULT_TOKEN="$ADMIN_TOKEN"

echo "[SecretID Rotation] Minting new SecretID for role 'vaultguard-role'..."
SECRET_OUTPUT=$(vault write -f -format=json auth/approle/role/vaultguard-role/secret-id)

NEW_SECRET_ID=$(echo "$SECRET_OUTPUT" | grep -o '"secret_id": *"[^"]*"' | head -1 | cut -d'"' -f4)
NEW_ACCESSOR=$(echo "$SECRET_OUTPUT" | grep -o '"secret_id_accessor": *"[^"]*"' | head -1 | cut -d'"' -f4)

echo "=============================================================================="
echo "   VAULTGUARD APPROLE SECRETID ROTATION SUCCESSFUL                            "
echo "=============================================================================="
echo "New SecretID Accessor: $NEW_ACCESSOR"
echo "New SecretID:          $NEW_SECRET_ID"
echo ""
echo "ROTATION PROCEDURE:"
echo "1. Update Vercel Environment Variable:"
echo "   - Go to Vercel Dashboard -> Project (vaultguard-api) -> Settings -> Environment Variables"
echo "   - Edit VAULT_SECRET_ID and paste the new SecretID above."
echo "   - (Or via Vercel CLI: printf '%s' \"$NEW_SECRET_ID\" | vercel env add VAULT_SECRET_ID production)"
echo ""
echo "2. Promote / Trigger Redeployment in Vercel:"
echo "   - Trigger a redeployment so new serverless containers load the new SecretID."
echo ""
echo "3. Destroy the Old SecretID (Optional - after redeployment is verified):"
echo "   - List existing accessors: vault list auth/approle/role/vaultguard-role/secret-id"
echo "   - Revoke old accessor:     vault write auth/approle/role/vaultguard-role/secret-id-accessor/destroy secret_id_accessor=\"<OLD_ACCESSOR>\""
echo "=============================================================================="
