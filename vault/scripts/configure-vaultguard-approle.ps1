param(
    [string]$VaultRootToken = $env:VAULT_TOKEN,
    [string]$VaultAddr = $(if ($env:VAULT_ADDR) { $env:VAULT_ADDR } else { "http://127.0.0.1:8200" }),
    [string]$KeyFile = "d:\Vault_guard\vault\unseal-keys.json",
    [switch]$UpdateBackendEnv = $true
)

$ErrorActionPreference = "Stop"

$vaultExe = "d:\Vault_guard\bin\vault.exe"
if (-not (Test-Path $vaultExe)) {
    Write-Error "[Vault Config ERROR] vault.exe not found at $vaultExe"
    exit 1
}

$env:VAULT_ADDR = $VaultAddr

# Attempt to locate Root Token
if (-not $VaultRootToken -and (Test-Path $KeyFile)) {
    try {
        $keys = Get-Content $KeyFile -Raw | ConvertFrom-Json
        if ($keys.root_token) {
            $VaultRootToken = $keys.root_token
            Write-Host "[Vault Config] Loaded Vault root token securely from $KeyFile"
        }
    } catch {
        Write-Warning "[Vault Config] Could not parse $KeyFile"
    }
}

if (-not $VaultRootToken) {
    Write-Host -ForegroundColor Yellow "[Vault Config] Vault Root Token required for administrative provisioning."
    $sec = Read-Host "Enter Vault Root Token" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $VaultRootToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

if (-not $VaultRootToken) {
    Write-Error "[Vault Config ERROR] No root token provided. Administrative provisioning aborted."
    exit 1
}

$env:VAULT_TOKEN = $VaultRootToken

# Verify Vault status
Write-Host "[Vault Config] Verifying Vault status at $VaultAddr..."
$statusJson = & $vaultExe status -format=json 2>$null
if ($LASTEXITCODE -ne 0 -and -not $statusJson) {
    Write-Error "[Vault Config ERROR] Vault is offline, sealed, or unreachable at $VaultAddr. Ensure Vault is started and unsealed first."
    exit 1
}

$status = $statusJson | ConvertFrom-Json
if ($status.sealed -eq $true) {
    Write-Error "[Vault Config ERROR] Vault is currently SEALED. Please run unseal-vault.ps1 before provisioning."
    exit 1
}
if ($status.initialized -ne $true) {
    Write-Error "[Vault Config ERROR] Vault is NOT initialized. Please run init-vault-persistent.ps1 first."
    exit 1
}

Write-Host "[Vault Config] Vault is active and unsealed. Cluster ID: $($status.cluster_id)"

# 1. Enable KV v2 secrets engine at secret/
Write-Host "[Vault Config] Verifying KV v2 secrets engine at 'secret/'..."
$secretsJson = & $vaultExe secrets list -format=json 2>$null
$secretsList = if ($secretsJson) { $secretsJson | ConvertFrom-Json } else { @{} }
$hasSecretMount = $secretsList.PSObject.Properties['secret/'] -ne $null

if (-not $hasSecretMount) {
    Write-Host "[Vault Config] Enabling KV v2 engine at mount path 'secret/'..."
    & $vaultExe secrets enable -path=secret kv-v2
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[Vault Config ERROR] Failed to enable KV v2 secrets engine at path 'secret/'."
        exit 1
    }
    Write-Host "[Vault Config] KV v2 engine enabled successfully at 'secret/'."
} else {
    Write-Host "[Vault Config] Secrets engine already mounted at 'secret/'."
}

# 2. Write Application Policy
$policyPath = "d:\Vault_guard\vault\policies\vaultguard-app-policy.hcl"
if (-not (Test-Path $policyPath)) {
    Write-Error "[Vault Config ERROR] Policy file not found at $policyPath"
    exit 1
}
Write-Host "[Vault Config] Applying application policy: vaultguard-app..."
& $vaultExe policy write vaultguard-app $policyPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "[Vault Config ERROR] Failed to write vaultguard-app policy."
    exit 1
}
Write-Host "[Vault Config] Application policy 'vaultguard-app' registered successfully."

# 3. Configure File Audit Device
Write-Host "[Vault Config] Verifying file audit device..."
$auditLogDir = "d:\Vault_guard\vault\logs"
if (-not (Test-Path $auditLogDir)) {
    New-Item -ItemType Directory -Path $auditLogDir -Force | Out-Null
}
$auditLogPath = "d:/Vault_guard/vault/logs/vault_audit.log"
$auditJson = & $vaultExe audit list -format=json 2>$null
$auditList = if ($auditJson) { $auditJson | ConvertFrom-Json } else { @{} }

if (-not $auditList.PSObject.Properties['file/']) {
    Write-Host "[Vault Config] Enabling file audit logging to $auditLogPath..."
    & $vaultExe audit enable file file_path=$auditLogPath
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "[Vault Config WARNING] Could not enable audit device at $auditLogPath (may already be attached or locked)."
    } else {
        Write-Host "[Vault Config] File audit device enabled successfully."
    }
} else {
    Write-Host "[Vault Config] File audit device is already active."
}

# 4. Enable AppRole Auth Method
Write-Host "[Vault Config] Verifying AppRole auth method..."
$authJson = & $vaultExe auth list -format=json 2>$null
$authList = if ($authJson) { $authJson | ConvertFrom-Json } else { @{} }

if (-not $authList.PSObject.Properties['approle/']) {
    Write-Host "[Vault Config] Enabling AppRole authentication method..."
    & $vaultExe auth enable approle
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[Vault Config ERROR] Failed to enable approle auth method."
        exit 1
    }
} else {
    Write-Host "[Vault Config] AppRole authentication method is already enabled."
}

# 5. Configure vaultguard-role
Write-Host "[Vault Config] Configuring AppRole role: vaultguard-role..."
& $vaultExe write auth/approle/role/vaultguard-role token_policies="vaultguard-app" token_ttl="1h" token_max_ttl="24h" secret_id_ttl="720h"
if ($LASTEXITCODE -ne 0) {
    Write-Error "[Vault Config ERROR] Failed to configure vaultguard-role."
    exit 1
}

# 6. Read RoleID and Generate SecretID
$roleIdData = & $vaultExe read -format=json auth/approle/role/vaultguard-role/role-id | ConvertFrom-Json
$roleId = $roleIdData.data.role_id

$secretIdData = & $vaultExe write -format=json -f auth/approle/role/vaultguard-role/secret-id | ConvertFrom-Json
$secretId = $secretIdData.data.secret_id
$secretIdAccessor = $secretIdData.data.secret_id_accessor

# 7. Mint restricted periodic application token for fallback
Write-Host "[Vault Config] Minting restricted backup token (period=720h, policy=vaultguard-app)..."
$appTokenData = & $vaultExe token create -policy=vaultguard-app -period=720h -format=json | ConvertFrom-Json
$appToken = $appTokenData.auth.client_token
$appTokenAccessor = $appTokenData.auth.accessor

Write-Host -ForegroundColor Green "[Vault Config SUCCESS] Credentials generated:"
Write-Host "  Role ID:              $roleId"
Write-Host "  Secret ID Accessor:   $secretIdAccessor"
Write-Host "  App Token Accessor:   $appTokenAccessor"
Write-Host "  (Raw SecretID and AppToken are kept confidential)"

# 8. Update backend/.env if requested
if ($UpdateBackendEnv) {
    $backendEnvPath = "d:\Vault_guard\backend\.env"
    Write-Host "[Vault Config] Updating $backendEnvPath with newly provisioned credentials..."
    
    $envContent = ""
    if (Test-Path $backendEnvPath) {
        $envContent = Get-Content $backendEnvPath -Raw
    }

    # Helper function to update or append env var
    function Set-EnvVar([string]$content, [string]$name, [string]$val) {
        $pattern = "(?m)^$name=.*$"
        if ($content -match $pattern) {
            return ($content -replace $pattern, "$name=$val")
        } else {
            return "$content`r`n$name=$val"
        }
    }

    $envContent = Set-EnvVar $envContent "VAULT_ADDR" $VaultAddr
    $envContent = Set-EnvVar $envContent "VAULT_ROLE_ID" $roleId
    $envContent = Set-EnvVar $envContent "VAULT_SECRET_ID" $secretId
    $envContent = Set-EnvVar $envContent "VAULT_APP_TOKEN" $appToken
    $envContent = Set-EnvVar $envContent "VAULT_KV_MOUNT" "secret"

    Set-Content -Path $backendEnvPath -Value $envContent.Trim() -Encoding utf8
    Write-Host -ForegroundColor Green "[Vault Config SUCCESS] backend/.env updated with persistent Vault credentials."
}

# Clear root token from environment
$env:VAULT_TOKEN = ""

Write-Host -ForegroundColor Green "[Vault Config COMPLETE] Local persistent Vault is fully provisioned for VaultGuard!"

