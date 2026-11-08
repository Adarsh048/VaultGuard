# ==============================================================================
# VaultGuard - Start Local Persistent HashiCorp Vault Server
# ==============================================================================
# Starts HashiCorp Vault Community Edition with persistent integrated Raft
# storage using vault/config/vault-local.hcl. Dev mode is strictly disabled.
# ==============================================================================

param(
    [string]$ConfigPath = "d:\Vault_guard\vault\config\vault-local.hcl",
    [string]$VaultExe = "d:\Vault_guard\bin\vault.exe"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $VaultExe)) {
    Write-Error "Vault binary not found at $VaultExe. Ensure bin\vault.exe exists."
    exit 1
}

if (!(Test-Path $ConfigPath)) {
    Write-Error "Vault configuration file not found at $ConfigPath."
    exit 1
}

# Ensure persistent data and logs directories exist
$dataDir = "d:\Vault_guard\vault\data"
$logsDir = "d:\Vault_guard\vault\logs"
if (!(Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
if (!(Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }

# Check if Vault is already listening on port 8200
$existingPort = Get-NetTCPConnection -LocalPort 8200 -State Listen -ErrorAction SilentlyContinue
if ($existingPort) {
    Write-Host "[Vault] A service is already listening on 127.0.0.1:8200 (PID: $($existingPort.OwningProcess))." -ForegroundColor Yellow
    $env:VAULT_ADDR = "http://127.0.0.1:8200"
    & $VaultExe status
    exit 0
}

Write-Host "[Vault] Launching HashiCorp Vault Community Edition (Persistent Raft Storage)..." -ForegroundColor Cyan
$vaultProcess = Start-Process -FilePath $VaultExe -ArgumentList "server -config=`"$ConfigPath`"" -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

if ($vaultProcess.HasExited) {
    Write-Error "[Vault ERROR] Vault process exited immediately. Check configuration or logs."
    exit 1
}

Write-Host "[Vault] Server process started successfully (PID: $($vaultProcess.Id))." -ForegroundColor Green
$env:VAULT_ADDR = "http://127.0.0.1:8200"

# Probe Vault status
Start-Sleep -Seconds 1
& $VaultExe status

Write-Host "`n[Vault] Persistent Vault is listening on http://127.0.0.1:8200" -ForegroundColor Green
Write-Host "[Vault] Next step: If uninitialized, run .\vault\scripts\init-vault-persistent.ps1" -ForegroundColor Yellow
Write-Host "[Vault] If sealed, run .\vault\scripts\unseal-vault.ps1" -ForegroundColor Yellow

