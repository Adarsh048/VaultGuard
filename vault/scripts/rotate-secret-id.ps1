param(
    [string]$VaultRootToken = $env:VAULT_TOKEN,
    [string]$VaultAddr = $(if ($env:VAULT_ADDR) { $env:VAULT_ADDR } else { "http://127.0.0.1:8200" })
)

# ==============================================================================
# VaultGuard - AppRole SecretID Zero-Downtime Rotation Helper (PowerShell)
# ==============================================================================

if (-not $VaultRootToken) {
    Write-Error "[SecretID Rotation ERROR] Explicit administrative credentials required. Pass -VaultRootToken parameter or set VAULT_TOKEN environment variable."
    exit 1
}

$env:VAULT_ADDR = $VaultAddr
$env:VAULT_TOKEN = $VaultRootToken
$vaultExe = "d:\Vault_guard\bin\vault.exe"

Write-Host "[SecretID Rotation] Retrieving Role ID for 'vaultguard-role'..."
$roleIdJson = & $vaultExe read -format=json auth/approle/role/vaultguard-role/role-id | ConvertFrom-Json
$roleId = $roleIdJson.data.role_id

Write-Host "[SecretID Rotation] Minting new SecretID for role 'vaultguard-role'..."
$secretIdJson = & $vaultExe write -format=json -f auth/approle/role/vaultguard-role/secret-id | ConvertFrom-Json
$newSecretId = $secretIdJson.data.secret_id
$newAccessor = $secretIdJson.data.secret_id_accessor

Write-Host "[SecretID Rotation] Pre-validating new SecretID authentication..."
$loginTest = & $vaultExe write -format=json auth/approle/login role_id=$roleId secret_id=$newSecretId 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "[SecretID Rotation CRITICAL] Pre-flight authentication failed! Rolling back new SecretID..."
    & $vaultExe write auth/approle/role/vaultguard-role/secret-id-accessor/destroy secret_id_accessor=$newAccessor | Out-Null
    exit 1
}

Write-Host "[SecretID Rotation] Pre-validation SUCCESSFUL. New SecretID is active and verified." -ForegroundColor Green
Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "   VAULTGUARD APPROLE SECRETID ROTATION STAGING & VERIFICATION                " -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "New SecretID Accessor: $newAccessor"
Write-Host "New SecretID:          $newSecretId"
Write-Host ""
Write-Host "STAGE 1: UPDATE VERCEL ENVIRONMENT VARIABLE"
Write-Host "  - In Vercel Dashboard -> Project (vaultguard-api) -> Settings -> Environment Variables"
Write-Host "  - Edit VAULT_SECRET_ID and replace it with the new SecretID above."
Write-Host ""
Write-Host "STAGE 2: REDEPLOY BACKEND IN VERCEL"
Write-Host "  - Trigger a redeployment so new serverless instances load the updated SecretID."
Write-Host ""
Write-Host "STAGE 3: VERIFY BACKEND READINESS"
Write-Host "  - Execute: Invoke-RestMethod -Uri 'https://<your-backend-domain>/api/health/ready'"
Write-Host "  - Confirm it returns HTTP 200 with status: 'UP'."
Write-Host ""
Write-Host "STAGE 4A: PROMOTION (IF VERIFICATION SUCCEEDED)"
Write-Host "  - List active accessors: & '$vaultExe' list auth/approle/role/vaultguard-role/secret-id"
Write-Host "  - Revoke the retired OLD accessor:"
Write-Host "    & '$vaultExe' write auth/approle/role/vaultguard-role/secret-id-accessor/destroy secret_id_accessor='<OLD_ACCESSOR>'"
Write-Host ""
Write-Host "STAGE 4B: ROLLBACK (IF VERIFICATION FAILED)"
Write-Host "  - Revert VAULT_SECRET_ID in Vercel back to previous SecretID (still valid in Vault)."
Write-Host "  - Redeploy Vercel backend."
Write-Host "  - Revoke the faulty new accessor:"
Write-Host "    & '$vaultExe' write auth/approle/role/vaultguard-role/secret-id-accessor/destroy secret_id_accessor='$newAccessor'"
Write-Host "=============================================================================="

return @{
    SecretId = $newSecretId
    Accessor = $newAccessor
}
