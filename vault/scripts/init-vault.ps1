param(
    [string]$VaultRootToken = $env:VAULT_TOKEN,
    [string]$VaultAddr = $(if ($env:VAULT_ADDR) { $env:VAULT_ADDR } else { "http://127.0.0.1:8200" })
)

if (-not $VaultRootToken) {
    Write-Error "[Vault Init ERROR] Explicit administrative credentials required. Pass -VaultRootToken parameter or set VAULT_TOKEN environment variable."
    exit 1
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

$auditListJson = & $vaultExe audit list -format=json 2>$null
if ($auditListJson -and ($auditListJson | ConvertFrom-Json).PSObject.Properties['file/']) {
    Write-Host "[Vault Init] Audit device 'file/' is already enabled."
} else {
    & $vaultExe audit enable file file_path=$auditLogPath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to enable Vault audit device at path $auditLogPath"
    }
}

Write-Host "[Vault Init] Configuring AppRole authentication method..."
$authListJson = & $vaultExe auth list -format=json 2>$null
if ($authListJson -and ($authListJson | ConvertFrom-Json).PSObject.Properties['approle/']) {
    Write-Host "[Vault Init] Auth method 'approle/' is already enabled."
} else {
    & $vaultExe auth enable approle
}

Write-Host "[Vault Init] Configuring AppRole role: vaultguard-role..."
& $vaultExe write auth/approle/role/vaultguard-role token_policies="vaultguard-app" token_ttl="1h" token_max_ttl="24h" secret_id_ttl="720h"

$roleIdJson = & $vaultExe read -format=json auth/approle/role/vaultguard-role/role-id | ConvertFrom-Json
$roleId = $roleIdJson.data.role_id

$secretIdJson = & $vaultExe write -format=json -f auth/approle/role/vaultguard-role/secret-id | ConvertFrom-Json
$secretId = $secretIdJson.data.secret_id

Write-Host "[Vault Init] AppRole configured successfully."
Write-Host "[Vault Init] ROLE_ID: $roleId"
Write-Host "[Vault Init] Generated SECRET_ID (expires in 720h)."
Write-Host "[Vault Init] ACTION REQUIRED: For serverless / production, set VAULT_ROLE_ID and VAULT_SECRET_ID in backend/.env"

Write-Host "[Vault Init] Minting backup restricted application identity token (policy=vaultguard-app)..."
$tokenOutput = & $vaultExe token create -policy=vaultguard-app -period=720h -format=json | ConvertFrom-Json
$appToken = $tokenOutput.auth.client_token
$accessor = $tokenOutput.auth.accessor

Write-Host "[Vault Init] Restricted application token provisioned (Accessor: $accessor)"
Write-Host "[Vault Init] Token generation successful. Configure as VAULT_APP_TOKEN for static/local environments."

return @{
    RoleId = $roleId
    SecretId = $secretId
    AppToken = $appToken
}
