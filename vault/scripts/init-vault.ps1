param(
    [string]$VaultRootToken = $env:VAULT_TOKEN,
    [string]$VaultAddr = $(if ($env:VAULT_ADDR) { $env:VAULT_ADDR } else { "http://127.0.0.1:8200" })
)

if (-not $VaultRootToken) {
    $VaultRootToken = "root-master-token-vg2026"
}

$env:VAULT_ADDR = $VaultAddr
$env:VAULT_TOKEN = $VaultRootToken
$vaultExe = "d:\Vault_guard\bin\vault.exe"

Write-Host "[Vault Init] Checking Vault status on $VaultAddr..."
& $vaultExe status

Write-Host "[Vault Init] Applying least-privilege application policy: vaultguard-app..."
& $vaultExe policy write vaultguard-app "d:\Vault_guard\vault\policies\vaultguard-app-policy.hcl"

Write-Host "[Vault Init] Configuring Vault File Audit Device..."
$auditLogDir = "d:\Vault_guard\vault\logs"
if (!(Test-Path $auditLogDir)) {
    New-Item -ItemType Directory -Path $auditLogDir -Force | Out-Null
}
$auditLogPath = "d:/Vault_guard/vault/logs/vault_audit.log"
try {
    & $vaultExe audit enable file file_path=$auditLogPath
} catch {
    Write-Host "[Vault Init] Audit device already enabled or configured."
}

Write-Host "[Vault Init] Minting restricted application identity token (policy=vaultguard-app)..."
$tokenOutput = & $vaultExe token create -policy=vaultguard-app -period=720h -format=json | ConvertFrom-Json
$appToken = $tokenOutput.auth.client_token
$accessor = $tokenOutput.auth.accessor

Write-Host "[Vault Init] Restricted application token provisioned (Accessor: $accessor)"
Write-Host "[Vault Init] Token generation successful. Configure this value as VAULT_APP_TOKEN in backend/.env"

# Return token object without logging full value to terminal in cleartext
return $appToken
