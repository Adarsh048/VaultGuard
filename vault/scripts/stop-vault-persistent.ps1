# ==============================================================================
# VaultGuard - Stop Local Persistent HashiCorp Vault Server
# ==============================================================================

param(
    [string]$VaultExe = "d:\Vault_guard\bin\vault.exe"
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "[Vault] Searching for active Vault processes..." -ForegroundColor Cyan
$processes = Get-Process -Name "vault" -ErrorAction SilentlyContinue

if (!$processes) {
    Write-Host "[Vault] No active Vault process found." -ForegroundColor Yellow
    exit 0
}

foreach ($proc in $processes) {
    Write-Host "[Vault] Stopping Vault process (PID: $($proc.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $proc.Id -Force
}

Start-Sleep -Seconds 1
Write-Host "[Vault] All local Vault processes stopped." -ForegroundColor Green

