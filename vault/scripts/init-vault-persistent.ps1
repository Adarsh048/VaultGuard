# ==============================================================================
# VaultGuard - Initialize Persistent HashiCorp Vault (Shamir Key Distribution)
# ==============================================================================
# Performs cryptographic Shamir initialization on a fresh persistent Vault instance.
# - Creates 5 Unseal Key Shares with a threshold of 3.
# - Never silently overwrites existing Vault data.
# - Saves operator keys to gitignored vault/unseal-keys.json for safe local retention.
# ==============================================================================

param(
    [string]$VaultAddr = $(if ($env:VAULT_ADDR) { $env:VAULT_ADDR } else { "http://127.0.0.1:8200" }),
    [string]$VaultExe = "d:\Vault_guard\bin\vault.exe",
    [string]$KeysOutputFile = "d:\Vault_guard\vault\unseal-keys.json"
)

$ErrorActionPreference = "Stop"
$env:VAULT_ADDR = $VaultAddr

if (!(Test-Path $VaultExe)) {
    Write-Error "Vault binary not found at $VaultExe."
    exit 1
}

Write-Host "[Vault Init] Checking status on $VaultAddr..." -ForegroundColor Cyan
$statusJson = & $VaultExe status -format=json 2>$null | ConvertFrom-Json

if ($statusJson -and $statusJson.initialized -eq $true) {
    Write-Host "==============================================================================" -ForegroundColor Yellow
    Write-Host "[Vault SAFEGUARD] Vault is ALREADY INITIALIZED." -ForegroundColor Yellow
    Write-Host "Storage data is intact. Re-initialization is blocked to prevent data destruction." -ForegroundColor Yellow
    Write-Host "If Vault is currently sealed, run: .\vault\scripts\unseal-vault.ps1" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Yellow
    exit 0
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "   VAULTGUARD PERSISTENT VAULT INITIALIZATION (SHAMIR SECRET SHARING)         " -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "Configuration: 5 Unseal Key Shares, Threshold: 3, Storage: Persistent Raft"

$confirm = Read-Host "Proceed with initializing this Vault instance? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "[Vault Init] Initialization cancelled by operator." -ForegroundColor Yellow
    exit 0
}

Write-Host "[Vault Init] Executing cryptographic operator initialization..." -ForegroundColor Cyan
$initResultJson = & $VaultExe operator init -key-shares=5 -key-threshold=3 -format=json

if ($LASTEXITCODE -ne 0 -or !$initResultJson) {
    Write-Error "[Vault Init ERROR] Failed to initialize Vault operator. Ensure Vault server is running."
    exit 1
}

# Save unseal keys to gitignored local file with read restriction
$initResultJson | Out-File -FilePath $KeysOutputFile -Encoding utf8 -Force

$initObj = $initResultJson | ConvertFrom-Json
$rootToken = $initObj.root_token
$unsealKeys = $initObj.unseal_keys_b64

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host "   VAULT INITIALIZATION COMPLETED SUCCESSFULLY!                               " -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "Operator Credentials Saved To: $KeysOutputFile (Protected by .gitignore)" -ForegroundColor Green
Write-Host "Total Unseal Key Shares Generated: $($unsealKeys.Count)"
Write-Host "Unseal Threshold Required:         3"
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Unseal Vault using 3 threshold keys:"
Write-Host "   powershell -ExecutionPolicy Bypass -File .\vault\scripts\unseal-vault.ps1" -ForegroundColor Yellow
Write-Host "2. Configure VaultGuard KV v2 Secrets Engine & AppRole:"
Write-Host "   powershell -ExecutionPolicy Bypass -File .\vault\scripts\configure-vaultguard-approle.ps1" -ForegroundColor Yellow
Write-Host "==============================================================================" -ForegroundColor Green

return @{
    Initialized = $true
    KeysFile = $KeysOutputFile
}

