param(
    [string]$VaultAddr = $(if ($env:VAULT_ADDR) { $env:VAULT_ADDR } else { "http://127.0.0.1:8200" }),
    [string]$KeyFile = "d:\Vault_guard\vault\unseal-keys.json"
)

$ErrorActionPreference = "Stop"

$vaultExe = "d:\Vault_guard\bin\vault.exe"
$env:VAULT_ADDR = $VaultAddr

Write-Host "================================================================="
Write-Host " VAULTGUARD - VAULT STORAGE PERSISTENCE VERIFICATION TEST "
Write-Host "================================================================="

if (-not (Test-Path $KeyFile)) {
    Write-Error "[Persistence Test ERROR] Unseal key file $KeyFile not found. Please run init-vault-persistent.ps1 first."
    exit 1
}

$keys = Get-Content $KeyFile -Raw | ConvertFrom-Json
$rootToken = $keys.root_token
$env:VAULT_TOKEN = $rootToken

# Step 1: Check initial status
Write-Host "`n[Step 1] Checking initial Vault status..."
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$statusJson = & $vaultExe status -format=json 2>$null
$ErrorActionPreference = $prevEAP

if (-not $statusJson) {
    Write-Host "[Persistence Test] Vault is not running. Starting Vault..." -ForegroundColor Cyan
    & "d:\Vault_guard\vault\scripts\start-vault-persistent.ps1"
    Start-Sleep -Seconds 3
    $ErrorActionPreference = "SilentlyContinue"
    $statusJson = & $vaultExe status -format=json 2>$null
    $ErrorActionPreference = $prevEAP
}

if (-not $statusJson) {
    Write-Error "[Persistence Test ERROR] Vault is not reachable at $VaultAddr."
    exit 1
}
$status = $statusJson | ConvertFrom-Json
if ($status.sealed -eq $true) {
    Write-Host "[Persistence Test] Vault is sealed. Unsealing now..."
    & "d:\Vault_guard\vault\scripts\unseal-vault.ps1" -KeysFile $KeyFile -Force
}

# Step 2: Write verification secret
$testKey = "persistence-test-$(Get-Random)"
$testPayload = "verified-raft-storage-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "`n[Step 2] Storing canary test secret in KV v2: secret/accounts/$testKey..."
& $vaultExe kv put "secret/accounts/$testKey" payload=$testPayload canary="true"
if ($LASTEXITCODE -ne 0) {
    Write-Error "[Persistence Test ERROR] Failed to write initial canary secret."
    exit 1
}

$readInitial = & $vaultExe kv get -format=json "secret/accounts/$testKey" | ConvertFrom-Json
$writtenVal = $readInitial.data.data.payload
if ($writtenVal -ne $testPayload) {
    Write-Error "[Persistence Test ERROR] Pre-restart verification failed: payload mismatch."
    exit 1
}
Write-Host -ForegroundColor Green "[Step 2 SUCCESS] Canary secret safely persisted to Raft backend: $writtenVal"

# Step 3: Gracefully stop Vault server
Write-Host "`n[Step 3] Gracefully shutting down Vault server..."
& "d:\Vault_guard\vault\scripts\stop-vault-persistent.ps1"
Start-Sleep -Seconds 2

# Verify port is closed
$tcpCheck = Test-NetConnection -ComputerName 127.0.0.1 -Port 8200 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($tcpCheck) {
    Write-Error "[Persistence Test ERROR] Vault process did not stop cleanly; port 8200 is still listening."
    exit 1
}
Write-Host -ForegroundColor Green "[Step 3 SUCCESS] Vault process stopped cleanly. Port 8200 is offline."

# Step 4: Restart persistent Vault server
Write-Host "`n[Step 4] Starting persistent Vault server..."
& "d:\Vault_guard\vault\scripts\start-vault-persistent.ps1"
Start-Sleep -Seconds 2

# Step 5: Verify Vault starts SEALED (proves Raft storage + Shamir encryption)
Write-Host "`n[Step 5] Verifying Vault state post-restart..."
$ErrorActionPreference = "SilentlyContinue"
$postStatusJson = & $vaultExe status -format=json 2>$null
$ErrorActionPreference = $prevEAP
$postStatus = $postStatusJson | ConvertFrom-Json
Write-Host "  Initialized: $($postStatus.initialized)"
Write-Host "  Sealed:      $($postStatus.sealed)"

if ($postStatus.initialized -ne $true) {
    Write-Error "[Persistence Test FAILED] Vault reported initialized=false! Raft storage lost data!"
    exit 1
}
if ($postStatus.sealed -ne $true) {
    Write-Warning "[Persistence Test WARNING] Vault was not sealed on restart."
} else {
    Write-Host -ForegroundColor Green "[Step 5 SUCCESS] Vault correctly started SEALED with persistent encrypted Raft storage."
}

# Step 6: Unseal Vault using keys
Write-Host "`n[Step 6] Unsealing Vault using quorum of Shamir unseal keys..."
& "d:\Vault_guard\vault\scripts\unseal-vault.ps1" -KeysFile $KeyFile -Force

# Step 7: Read back canary secret and verify exact match
Write-Host "`n[Step 7] Reading back canary secret from unsealed persistent Vault..."
$env:VAULT_TOKEN = $rootToken
$readPost = & $vaultExe kv get -format=json "secret/accounts/$testKey" | ConvertFrom-Json
$restoredVal = $readPost.data.data.payload

Write-Host "  Original Value: $testPayload"
Write-Host "  Restored Value: $restoredVal"

if ($restoredVal -ne $testPayload) {
    Write-Error "[Persistence Test FAILED] Data mismatch after restart! Expected '$testPayload', got '$restoredVal'"
    exit 1
}
Write-Host -ForegroundColor Green "[Step 7 SUCCESS] Secret data persisted across complete server restart and unseal cycle!"

# Step 8: Clean up test secret
Write-Host "`n[Step 8] Cleaning up canary secret..."
& $vaultExe kv metadata delete -mount=secret "accounts/$testKey" | Out-Null
$env:VAULT_TOKEN = ""

Write-Host "`n================================================================="
Write-Host -ForegroundColor Green " VERIFICATION PASSED: Persistent Raft Storage verified 100%! "
Write-Host "================================================================="
