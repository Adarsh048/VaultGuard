# ==============================================================================
# VaultGuard - Unseal Persistent HashiCorp Vault Server
# ==============================================================================
# Applies Shamir threshold keys (3 keys) to transition Vault from Sealed to Active.
# Supports interactive key entry or reading from protected vault/unseal-keys.json.
# ==============================================================================

param(
    [string]$VaultAddr = $(if ($env:VAULT_ADDR) { $env:VAULT_ADDR } else { "http://127.0.0.1:8200" }),
    [string]$VaultExe = "d:\Vault_guard\bin\vault.exe",
    [string]$KeysFile = "d:\Vault_guard\vault\unseal-keys.json",
    [string[]]$UnsealKeys = @()
)

$ErrorActionPreference = "Stop"
$env:VAULT_ADDR = $VaultAddr

if (!(Test-Path $VaultExe)) {
    Write-Error "Vault binary not found at $VaultExe."
    exit 1
}

Write-Host "[Vault Unseal] Checking Vault seal status on $VaultAddr..." -ForegroundColor Cyan
$statusJson = & $VaultExe status -format=json 2>$null | ConvertFrom-Json

if (!$statusJson) {
    Write-Error "[Vault Unseal ERROR] Unable to contact Vault on $VaultAddr. Is the Vault server running?"
    exit 1
}

if ($statusJson.initialized -eq $false) {
    Write-Error "[Vault Unseal ERROR] Vault is not initialized yet. Run .\vault\scripts\init-vault-persistent.ps1 first."
    exit 1
}

if ($statusJson.sealed -eq $false) {
    Write-Host "[Vault Unseal] Vault is ALREADY UNSEALED and ACTIVE." -ForegroundColor Green
    Write-Host "Cluster Name: $($statusJson.cluster_name)"
    Write-Host "Storage Type: $($statusJson.storage_type)"
    exit 0
}

Write-Host "==============================================================================" -ForegroundColor Yellow
Write-Host "   VAULT IS CURRENTLY SEALED (Threshold: 3 keys required)                    " -ForegroundColor Yellow
Write-Host "==============================================================================" -ForegroundColor Yellow

$keysToUse = @()

# Option A: Check if keys file exists
if ($UnsealKeys.Count -ge 3) {
    $keysToUse = $UnsealKeys[0..2]
} elseif (Test-Path $KeysFile) {
    Write-Host "[Vault Unseal] Discovered local unseal keys in $KeysFile." -ForegroundColor Cyan
    $confirm = Read-Host "Use keys from $KeysFile to unseal? (Y/n)"
    if ($confirm -ne 'n' -and $confirm -ne 'N') {
        $keyData = Get-Content $KeysFile -Raw | ConvertFrom-Json
        $keysToUse = $keyData.unseal_keys_b64[0..2]
    }
}

# Option B: Prompt interactively if not loaded
if ($keysToUse.Count -lt 3) {
    Write-Host "`nPlease enter 3 Shamir Unseal Keys:" -ForegroundColor Cyan
    for ($i = 1; $i -le 3; $i++) {
        $secureKey = Read-Host -Prompt "Enter Unseal Key $i" -AsSecureString
        $plainKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey))
        if ([string]::IsNullOrWhiteSpace($plainKey)) {
            Write-Error "Key $i cannot be empty."
            exit 1
        }
        $keysToUse += $plainKey
    }
}

# Apply unseal keys sequentially
for ($i = 0; $i -lt 3; $i++) {
    $key = $keysToUse[$i]
    Write-Host "[Vault Unseal] Applying Unseal Key $($i + 1) of 3..." -ForegroundColor Cyan
    $unsealOutput = & $VaultExe operator unseal -format=json $key | ConvertFrom-Json

    if ($unsealOutput.sealed -eq $false) {
        Write-Host "`n==============================================================================" -ForegroundColor Green
        Write-Host "   VAULT UNSEALED SUCCESSFULLY!                                               " -ForegroundColor Green
        Write-Host "==============================================================================" -ForegroundColor Green
        Write-Host "Status:        Active (Unsealed)" -ForegroundColor Green
        Write-Host "Cluster Name:  $($unsealOutput.cluster_name)" -ForegroundColor Green
        Write-Host "Storage Type:  $($unsealOutput.storage_type)" -ForegroundColor Green
        return @{ Sealed = $false; Active = $true }
    } else {
        Write-Host "  Progress: $($unsealOutput.progress) of $($unsealOutput.t) keys applied." -ForegroundColor Yellow
    }
}

Write-Error "[Vault Unseal ERROR] Failed to unseal Vault after 3 attempts."
exit 1

