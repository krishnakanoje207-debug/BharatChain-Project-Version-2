# BharatChain one-command demo bring-up (Windows / PowerShell).
#   powershell -ExecutionPolicy Bypass -File scripts\demo-up.ps1
# Brings up infra, a Hardhat node, deploys + seeds, and starts the backend API.
# The Hardhat node and backend open in their own windows so you can watch the logs.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Wait-Port($port, $name, $timeout = 60) {
  for ($i = 0; $i -lt $timeout; $i++) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return }
    Start-Sleep -Seconds 1
  }
  throw "$name did not come up on port $port within ${timeout}s"
}

Write-Host "[1/7] Docker engine + infra..." -ForegroundColor Cyan
docker info *> $null
if (-not $?) {
  Write-Host "  starting Docker Desktop (wait ~30s)..."
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  for ($i = 0; $i -lt 60; $i++) { docker info *> $null; if ($?) { break }; Start-Sleep -Seconds 3 }
}
npm run infra:up

Write-Host "[2/7] Hardhat node (new window)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; npm run node -w @bharatchain/contracts"
Wait-Port 8545 "Hardhat node"

Write-Host "[3/7] Deploy contracts..." -ForegroundColor Cyan
npm run deploy:local -w @bharatchain/contracts

Write-Host "[4/7] Build backend..." -ForegroundColor Cyan
npm run build -w @bharatchain/backend

Write-Host "[5/7] Seed demo data (schemes, vendors, registry root, admin)..." -ForegroundColor Cyan
npm run seed -w @bharatchain/backend

Write-Host "[6/7] Backend API (new window)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; npm run start:prod -w @bharatchain/backend"
for ($i = 0; $i -lt 40; $i++) { try { Invoke-RestMethod http://localhost:3001/api/health -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Seconds 1 } }

Write-Host "[7/7] Ready." -ForegroundColor Green
Write-Host ""
Write-Host "Backend API : http://localhost:3001/api  (health: /api/health)" -ForegroundColor Yellow
Write-Host "Admin login : phone 9000000000  password admin12345" -ForegroundColor Yellow
Write-Host ""
Write-Host "Start the unified portal in another terminal:" -ForegroundColor Yellow
Write-Host "  npm run dev -w @bharatchain/web           # all surfaces   :3000"
Write-Host "  (public - citizen - vendor - admin - RBI, role-routed in one app)"
Write-Host ""
Write-Host "Optional - index the public ledger (The Graph):" -ForegroundColor Yellow
Write-Host "  npm run subgraph:deploy -w @bharatchain/indexer"
Write-Host ""
Write-Host "See docs\DEMO.md for the full walkthrough. Tear down: scripts\demo-down.ps1"
