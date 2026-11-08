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

Write-Host "[SecretID Rotation] Minting new SecretID for role 'vaultguard-role'..."
$secretIdJson = & $vaultExe write -format=json -f auth/approle/role/vaultguard-role/secret-id | ConvertFrom-Json

$newSecretId = $secretIdJson.data.secret_id
$newAccessor = $secretIdJson.data.secret_id_accessor

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "   VAULTGUARD APPROLE SECRETID ROTATION SUCCESSFUL                            " -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "New SecretID Accessor: $newAccessor"
Write-Host "New SecretID:          $newSecretId"
Write-Host ""
Write-Host "ROTATION PROCEDURE:"
Write-Host "1. Update Vercel Environment Variable:"
Write-Host "   - Open Vercel Dashboard -> Project (vaultguard-api) -> Settings -> Environment Variables"
Write-Host "   - Edit VAULT_SECRET_ID and replace with the new value above."
Write-Host ""
Write-Host "2. Promote / Trigger Redeployment in Vercel:"
Write-Host "   - Redeploy the project so new serverless instances load the updated VAULT_SECRET_ID."
Write-Host ""
Write-Host "3. Destroy the Old SecretID (Optional - after redeployment is verified):"
Write-Host "   - List existing accessors: & '$vaultExe' list auth/approle/role/vaultguard-role/secret-id"
Write-Host "   - Destroy old accessor:    & '$vaultExe' write auth/approle/role/vaultguard-role/secret-id-accessor/destroy secret_id_accessor='<OLD_ACCESSOR>'"
Write-Host "=============================================================================="

return @{
    SecretId = $newSecretId
    Accessor = $newAccessor
}
