$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
$root = Split-Path $PSScriptRoot -Parent
$NA   = 100   # cohort A - enrolled BEFORE installment 1
$NB   = 12    # cohort B - enrolled LATE (after installment 1) to prove catch-up
$PW   = "citizen123"
$INST = 10000 # e-rupee per installment for PM-Kisan (schemeId 0)

function P($p,$b,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Method Post -Uri "$base$p" -ContentType "application/json" -Body ($b|ConvertTo-Json -Depth 8) -Headers $h }
function G($p,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Uri "$base$p" -Headers $h }

# Distinct farmer PANs (profession===1) so nullifiers never collide.
$total = $NA + $NB
Write-Host "### Picking $total distinct farmer identities from the fixed registry" -ForegroundColor Cyan
$pans = (& node -e "const r=require('$($root -replace '\\','/')/packages/registry/data/registry.json');const f=r.filter(x=>x.profession===1).sort(()=>Math.random()-0.5).slice(0,$total);console.log(f.map(x=>x.pan).join(','))").Trim().Split(",")
if ($pans.Count -lt $total) { Write-Host "  not enough farmer PANs ($($pans.Count))" -ForegroundColor Red; exit 1 }

function New-Citizen($pan) {
  $ph = "9"+(Get-Random -Min 100000000 -Max 999999999)
  $s = P "/auth/signup" @{phone=$ph;password=$PW;fullName="Scale $pan"} $null
  $v = P "/auth/verify-otp" @{phone=$ph;code=$s.devCode} $null
  $app = P "/applications" @{schemeId=0;pan=$pan} $v.tokens.accessToken
  return @{ token=$v.tokens.accessToken; appId=$app.id; pan=$pan; phone=$ph }
}

# Sessions auto-expire after ~60s without heartbeats (server-side auto-logout),
# so re-login right before reading a citizen's on-chain entitlement.
function Entitlement($p) {
  $t = (P "/auth/login" @{phone=$p.phone;password=$PW} $null).tokens.accessToken
  $e = G "/me/entitlements" $t
  if ($e) { [double]$e[0].entitlementFormatted } else { 0 }
}

# Enrol sequentially in-process (each ZK proof + on-chain enrol ~1.7s). The relayer
# serializer was already proven under concurrency; here reliability matters, so we
# avoid spawning 100s of processes. Re-login per submit so the 60s session never lapses.
function Enroll-All($people) {
  $results = @()
  foreach ($p in $people) {
    try {
      $t = (P "/auth/login" @{phone=$p.phone;password=$PW} $null).tokens.accessToken
      $results += (Invoke-RestMethod -Method Post -Uri "$base/applications/$($p.appId)/submit" -Headers @{Authorization="Bearer $t"} -ContentType "application/json" -Body "{}" -TimeoutSec 600).status
    } catch { $results += "ERROR:" + $_.Exception.Message }
  }
  return $results
}

# ---- Cohort A ----
Write-Host "### Provisioning cohort A ($NA citizens + applications)" -ForegroundColor Cyan
$A = @(); foreach ($pan in $pans[0..($NA-1)]) { $A += New-Citizen $pan }
Write-Host "  created $($A.Count) cohort-A applications"

Write-Host "### Enrolling cohort A (sequential, ~1.7s each)" -ForegroundColor Cyan
$ra = Enroll-All $A
$aOk  = @($ra | Where-Object { $_ -eq "APPROVED" }).Count
$aErr = @($ra | Where-Object { $_ -like "ERROR*" }).Count
Write-Host "  cohort A: APPROVED=$aOk  ERROR=$aErr  (of $NA)"

$admin = (P "/auth/login" @{phone="9000000000";password="admin12345"} $null).tokens.accessToken

# ---- Installment 1 ----
Write-Host "### Installment 1 (advance) - should pay all of cohort A" -ForegroundColor Yellow
$r1 = P "/disbursement/rounds" @{schemeId=0} $admin
Write-Host "  inst#$($r1.installmentNo): beneficiaries=$($r1.beneficiaryCount) claimed=$($r1.claimed) failed=$($r1.failed)"

# ---- Cohort B (late joiners) ----
Write-Host "### Provisioning cohort B ($NB LATE citizens, after installment 1)" -ForegroundColor Cyan
$B = @(); foreach ($pan in $pans[$NA..($total-1)]) { $B += New-Citizen $pan }
$rb = Enroll-All $B
$bOk = @($rb | Where-Object { $_ -eq "APPROVED" }).Count
Write-Host "  cohort B: APPROVED=$bOk (of $NB)"

# ---- Installment 2 ----
Write-Host "### Installment 2 (advance) - cohort A 2nd + cohort B 1st catch-up" -ForegroundColor Yellow
$r2 = P "/disbursement/rounds" @{schemeId=0} $admin
Write-Host "  inst#$($r2.installmentNo): beneficiaries=$($r2.beneficiaryCount) claimed=$($r2.claimed) failed=$($r2.failed)"

# ---- Installment 3 ----
Write-Host "### Installment 3 (advance) - cohort A 3rd + cohort B 2nd" -ForegroundColor Yellow
$r3 = P "/disbursement/rounds" @{schemeId=0} $admin
Write-Host "  inst#$($r3.installmentNo): beneficiaries=$($r3.beneficiaryCount) claimed=$($r3.claimed) failed=$($r3.failed)"

# ---- Verify EVERY citizen's on-chain entitlement (via backend /me, single source of truth) ----
Write-Host "### Verifying entitlements for ALL $total citizens" -ForegroundColor Cyan
$expA = 3 * $INST   # cohort A: 3 installments
$expB = 3 * $INST   # cohort B: late, but fully caught up to 3 installments by inst 3
$aGood = 0; $aBad = @()
foreach ($p in $A) { $v = Entitlement $p; if ($v -eq $expA) { $aGood++ } else { $aBad += "$($p.pan)=$v" } }
$bGood = 0; $bBad = @()
foreach ($p in $B) { $v = Entitlement $p; if ($v -eq $expB) { $bGood++ } else { $bBad += "$($p.pan)=$v" } }

Write-Host "`n=========================================="
Write-Host "  Cohort A (early):  $aGood/$($A.Count) at exactly $expA e-Rupee (3 installments)"
Write-Host "  Cohort B (late):   $bGood/$($B.Count) at exactly $expB e-Rupee (fully caught up to 3 installments)"
Write-Host "  Rounds: inst1 claimed=$($r1.claimed)/$($r1.beneficiaryCount), inst2 claimed=$($r2.claimed)/$($r2.beneficiaryCount), inst3 claimed=$($r3.claimed)/$($r3.beneficiaryCount)"
if ($aBad.Count) { Write-Host "  A mismatches: $($aBad -join ', ')" -ForegroundColor Red }
if ($bBad.Count) { Write-Host "  B mismatches: $($bBad -join ', ')" -ForegroundColor Red }

$ok = ($aErr -eq 0) -and ($r1.failed -eq 0) -and ($r2.failed -eq 0) -and ($r3.failed -eq 0) `
  -and ($r1.claimed -eq $A.Count) -and ($r1.beneficiaryCount -eq $A.Count) `
  -and ($r2.claimed -eq ($A.Count + $B.Count)) -and ($r3.claimed -eq ($A.Count + $B.Count)) `
  -and ($aGood -eq $A.Count) -and ($bGood -eq $B.Count)
if ($ok) { Write-Host "  SCALE 100+ / 3-INSTALLMENT: PASS" -ForegroundColor Green }
else     { Write-Host "  SCALE 100+ / 3-INSTALLMENT: FAIL" -ForegroundColor Red }
Write-Host "=========================================="
if (-not $ok) { exit 1 }
