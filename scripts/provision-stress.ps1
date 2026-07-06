$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
$root = Split-Path $PSScriptRoot -Parent
$N = 12
function P($p,$b,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Method Post -Uri "$base$p" -ContentType "application/json" -Body ($b|ConvertTo-Json -Depth 8) -Headers $h }
function G($p,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Uri "$base$p" -Headers $h }

# N distinct random farmer identities (distinct so nullifiers don't collide).
$pans = (& node -e "const r=require('$($root -replace '\\','/')/packages/registry/data/registry.json');const f=r.filter(x=>x.profession===1).sort(()=>Math.random()-0.5).slice(0,$N);console.log(f.map(x=>x.pan).join(','))").Trim().Split(",")

Write-Host "### Setup: $N citizens + applications (PM-Kisan)" -ForegroundColor Cyan
$people = @()
foreach ($pan in $pans) {
  $ph = "9"+(Get-Random -Min 100000000 -Max 999999999)
  $s = P "/auth/signup" @{phone=$ph;password="citizen123";fullName="Stress $pan"} $null
  $v = P "/auth/verify-otp" @{phone=$ph;code=$s.devCode} $null
  $app = P "/applications" @{schemeId=0;pan=$pan} $v.tokens.accessToken
  $people += @{ token=$v.tokens.accessToken; appId=$app.id; pan=$pan }
}
Write-Host "  created $($people.Count) applications"

Write-Host "### Fire $N enrolments CONCURRENTLY (stresses relayer nonce serializer)" -ForegroundColor Cyan
$jobs = foreach ($p in $people) {
  Start-Job -ScriptBlock {
    param($base,$token,$appId)
    try { (Invoke-RestMethod -Method Post -Uri "$base/applications/$appId/submit" -Headers @{Authorization="Bearer $token"} -ContentType "application/json" -Body "{}").status }
    catch { "ERROR:" + $_.Exception.Response.StatusCode.value__ }
  } -ArgumentList $base, $p.token, $p.appId
}
$results = $jobs | Wait-Job -Timeout 180 | Receive-Job
$jobs | Remove-Job -Force
$approved = @($results | Where-Object { $_ -eq "APPROVED" }).Count
$rejected = @($results | Where-Object { $_ -eq "REJECTED" }).Count
$errors   = @($results | Where-Object { $_ -like "ERROR*" }).Count
Write-Host "  results: APPROVED=$approved REJECTED=$rejected ERROR(5xx)=$errors"

Write-Host "### Provision tokens to everyone at once (one disbursal round)" -ForegroundColor Cyan
$admin = (P "/auth/login" @{phone="9000000000";password="admin12345"} $null).tokens.accessToken
$round = P "/disbursement/rounds" @{schemeId=0} $admin
Write-Host "  round: beneficiaries=$($round.beneficiaryCount) claimed=$($round.claimed) failed=$($round.failed)"

Write-Host "### Verify a sample of the new citizens were funded" -ForegroundColor Cyan
$sample = $people | Get-Random -Count ([Math]::Min(4, $people.Count))
$funded = 0
foreach ($p in $sample) { $e = G "/me/entitlements" $p.token; if ($e -and [double]$e[0].entitlementFormatted -ge 10000) { $funded++ } }

Write-Host "`n=========================================="
$ok = ($errors -eq 0) -and ($round.failed -eq 0) -and ($approved -ge ($N - 1)) -and ($funded -eq $sample.Count)
if ($ok) { Write-Host "  PROVISION STRESS: PASS  (0 nonce/5xx errors, $($round.claimed) credited, $funded/$($sample.Count) sampled funded)" -ForegroundColor Green }
else { Write-Host "  PROVISION STRESS: FAIL  (errors=$errors roundFailed=$($round.failed) approved=$approved funded=$funded/$($sample.Count))" -ForegroundColor Red }
Write-Host "=========================================="
if (-not $ok) { exit 1 }
