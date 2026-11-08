#!/bin/sh
# ==============================================================================
# VaultGuard - AppRole SecretID Zero-Downtime Rotation Helper
# ==============================================================================
# Generates and pre-validates a new SecretID for the vaultguard-role,
# enabling staged zero-downtime rotation with complete rollback safety.
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

echo "[SecretID Rotation] Retrieving Role ID for 'vaultguard-role'..."
ROLE_ID=$(vault read -field=role_id auth/approle/role/vaultguard-role/role-id)

echo "[SecretID Rotation] Minting new SecretID for role 'vaultguard-role'..."
SECRET_OUTPUT=$(vault write -f -format=json auth/approle/role/vaultguard-role/secret-id)

NEW_SECRET_ID=$(echo "$SECRET_OUTPUT" | grep -o '"secret_id": *"[^"]*"' | head -1 | cut -d'"' -f4)
NEW_ACCESSOR=$(echo "$SECRET_OUTPUT" | grep -o '"secret_id_accessor": *"[^"]*"' | head -1 | cut -d'"' -f4)

echo "[SecretID Rotation] Pre-validating new SecretID authentication..."
LOGIN_TEST=$(vault write -format=json auth/approle/login role_id="$ROLE_ID" secret_id="$NEW_SECRET_ID" 2>&1) || {
  echo "[SecretID Rotation CRITICAL] Pre-flight authentication failed! Rolling back new SecretID..." >&2
  vault write auth/approle/role/vaultguard-role/secret-id-accessor/destroy secret_id_accessor="$NEW_ACCESSOR" >/dev/null 2>&1 || true
  exit 1
}

echo "[SecretID Rotation] Pre-validation SUCCESSFUL. New SecretID is active and verified."
echo ""
echo "=============================================================================="
echo "   VAULTGUARD APPROLE SECRETID ROTATION STAGING & VERIFICATION                "
echo "=============================================================================="
echo "New SecretID Accessor: $NEW_ACCESSOR"
echo "New SecretID:          $NEW_SECRET_ID"
echo ""
echo "STAGE 1: UPDATE VERCEL ENVIRONMENT VARIABLE"
echo "  - In Vercel Dashboard -> Project (vaultguard-api) -> Settings -> Environment Variables"
echo "  - Edit VAULT_SECRET_ID and replace it with the new SecretID above."
echo "  - (CLI Alternative: printf '%s' \"$NEW_SECRET_ID\" | vercel env add VAULT_SECRET_ID production)"
echo ""
echo "STAGE 2: REDEPLOY BACKEND IN VERCEL"
echo "  - Trigger a redeployment so new serverless instances load the updated SecretID."
echo ""
echo "STAGE 3: VERIFY BACKEND READINESS"
echo "  - Execute: curl -f https://<your-backend-domain>/api/health/ready"
echo "  - Confirm it returns HTTP 200 with status: 'UP'."
echo ""
echo "STAGE 4A: PROMOTION (IF VERIFICATION SUCCEEDED)"
echo "  - List active accessors: vault list auth/approle/role/vaultguard-role/secret-id"
echo "  - Revoke the retired OLD accessor:"
echo "    vault write auth/approle/role/vaultguard-role/secret-id-accessor/destroy secret_id_accessor=\"<OLD_ACCESSOR>\""
echo ""
echo "STAGE 4B: ROLLBACK (IF VERIFICATION FAILED)"
echo "  - Revert VAULT_SECRET_ID in Vercel back to the previous SecretID (still valid in Vault)."
echo "  - Redeploy Vercel backend."
echo "  - Revoke the faulty new accessor:"
echo "    vault write auth/approle/role/vaultguard-role/secret-id-accessor/destroy secret_id_accessor=\"$NEW_ACCESSOR\""
echo "=============================================================================="
