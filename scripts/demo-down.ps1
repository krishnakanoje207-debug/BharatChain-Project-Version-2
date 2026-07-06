# Tear down the BharatChain demo: stop the backend + Hardhat node, then infra.
#   powershell -ExecutionPolicy Bypass -File scripts\demo-down.ps1
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "Stopping backend + Hardhat node…"
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*dist*main.js*" -or $_.CommandLine -like "*hardhat*node*" } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force; "  killed PID $($_.ProcessId)" } catch {} }

Write-Host "Stopping infra…"
npm run infra:down

Write-Host "Done. (Docker volumes persist; use 'docker compose -f infra/docker-compose.yml down -v' to wipe data.)"
