param(
    [string]$VaultRootToken = "root-master-token-vg2026",
    [string]$VaultAddr = "http://127.0.0.1:8200"
)

$env:VAULT_ADDR = $VaultAddr
$env:VAULT_TOKEN = $VaultRootToken
$vaultExe = "d:\Vault_guard\bin\vault.exe"

Write-Host "Checking Vault status..."
& $vaultExe status

Write-Host "Creating VaultGuard App policy..."
& $vaultExe policy write vaultguard-app "d:\Vault_guard\vault\policies\vaultguard-app-policy.hcl"

Write-Host "Enabling Vault Audit Log..."
$auditLogPath = "d:/Vault_guard/vault/logs/vault_audit.log"
# Create file if not exists
if (!(Test-Path "d:\Vault_guard\vault\logs")) {
    New-Item -ItemType Directory -Path "d:\Vault_guard\vault\logs" -Force
}
& $vaultExe audit enable file file_path=$auditLogPath

Write-Host "Creating restricted app token for VaultGuard backend..."
$tokenOutput = & $vaultExe token create -policy=vaultguard-app -period=720h -format=json | ConvertFrom-Json
$appToken = $tokenOutput.auth.client_token
Write-Host "App Token created: $appToken"

return $appToken

