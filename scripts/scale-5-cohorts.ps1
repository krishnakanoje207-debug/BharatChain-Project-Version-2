$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
$root = Split-Path $PSScriptRoot -Parent
$SCHEME = 0          # PM-Kisan: installment 10k, cap 3 -> 30k total
$INST   = 10000
$CAP    = 30000      # maxInstallments(3) * installment(10k)
$N      = 20         # citizens per cohort (5 cohorts = 100 citizens)
$PW     = "citizen123"
$script:fail = 0
function chk($n,$c){ if($c){Write-Host "  [PASS] $n" -ForegroundColor Green}else{Write-Host "  [FAIL] $n" -ForegroundColor Red;$script:fail++} }
function P($p,$b,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Method Post -Uri "$base$p" -ContentType "application/json" -Body ($b|ConvertTo-Json -Depth 8) -Headers $h }
function G($p,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Uri "$base$p" -Headers $h }

# 100 distinct farmer PANs (distinct -> nullifiers never collide).
$total = 5 * $N
$pans = (& node -e "const r=require('$($root -replace '\\','/')/packages/registry/data/registry.json');const f=r.filter(x=>x.profession===1).sort(()=>Math.random()-0.5).slice(0,$total);console.log(f.map(x=>x.pan).join(','))").Trim().Split(",")
if ($pans.Count -lt $total) { Write-Host "not enough farmer PANs" -ForegroundColor Red; exit 1 }
$idx = 0

function New-Citizen($pan) {
  $ph = "9"+(Get-Random -Min 100000000 -Max 999999999)
  $s = P "/auth/signup" @{phone=$ph;password=$PW;fullName="C5 $pan"} $null
  $v = P "/auth/verify-otp" @{phone=$ph;code=$s.devCode} $null
  $app = P "/applications" @{schemeId=$SCHEME;pan=$pan} $v.tokens.accessToken
  return @{ appId=$app.id; pan=$pan; phone=$ph }
}
# Build + enrol a cohort of N (sequential ZK proofs ~1.7s each; re-login per call so the 60s session never lapses).
function New-Cohort($label) {
  Write-Host "### Enrolling cohort $label ($N citizens)" -ForegroundColor Cyan
  $people = @(); $ok = 0
  for ($i=0;$i -lt $N;$i++) {
    $p = New-Citizen $script:pans[$script:idx]; $script:idx++
    $t = (P "/auth/login" @{phone=$p.phone;password=$PW} $null).tokens.accessToken
    if ((Invoke-RestMethod -Method Post -Uri "$base/applications/$($p.appId)/submit" -Headers @{Authorization="Bearer $t"} -ContentType "application/json" -Body "{}" -TimeoutSec 600).status -eq "APPROVED") { $ok++ }
    $people += $p
  }
  chk "cohort $label enrolled $ok/$N" ($ok -eq $N)
  return $people
}
function Bal($p) {
  $t = (P "/auth/login" @{phone=$p.phone;password=$PW} $null).tokens.accessToken
  $e = G "/me/entitlements" $t; $row = $e | Where-Object { $_.schemeId -eq $SCHEME }
  if ($row) { [double]$row.entitlementFormatted } else { 0 }
}
# Every member of a cohort is at exactly $amt.
function CohortAll($people,$amt) { $bad=0; foreach($p in $people){ if((Bal $p) -ne $amt){$bad++} }; return $bad -eq 0 }
# Re-login admin each round so the 60s heartbeat session never lapses mid-test.
function Round() {
  $script:admin = (P "/auth/login" @{phone="9000000000";password="admin12345"} $null).tokens.accessToken
  P "/disbursement/rounds" @{schemeId=$SCHEME} $script:admin
}

# --- Early cohorts A,B,C (all before installment 1) ---
$A = New-Cohort "A"; $B = New-Cohort "B"; $C = New-Cohort "C"
$script:admin = (P "/auth/login" @{phone="9000000000";password="admin12345"} $null).tokens.accessToken

Write-Host "`n### Rounds 1-3: early cohorts climb 10k -> 20k -> 30k then CAP" -ForegroundColor Yellow
$r1 = Round; chk "round1 = installment 1" ($r1.installmentNo -eq 1)
chk "A,B,C all at 10k after round 1" ((CohortAll $A $INST) -and (CohortAll $B $INST) -and (CohortAll $C $INST))
$r2 = Round; chk "round2 = installment 2" ($r2.installmentNo -eq 2)
chk "A,B,C all at 20k after round 2" ((CohortAll $A (2*$INST)) -and (CohortAll $B (2*$INST)) -and (CohortAll $C (2*$INST)))
$r3 = Round; chk "round3 = installment 3" ($r3.installmentNo -eq 3)
chk "A,B,C all at 30k (cap) after round 3" ((CohortAll $A $CAP) -and (CohortAll $B $CAP) -and (CohortAll $C $CAP))

# --- Cohort D joins after installment 3 ---
$D = New-Cohort "D"
Write-Host "`n### Round 4: D catches up to 30k; A,B,C must NOT exceed 30k" -ForegroundColor Yellow
$r4 = Round
chk "round4 stayed at the cap (installment 3, not 4)" ($r4.installmentNo -eq 3)
chk "D fully caught up to 30k in one round" (CohortAll $D $CAP)
chk "A,B,C STILL exactly 30k (cap held, no over-pay)" ((CohortAll $A $CAP) -and (CohortAll $B $CAP) -and (CohortAll $C $CAP))

# --- Round 5: everyone is at the cap -> must be refused ---
Write-Host "`n### Round 5: all at cap -> round must be REJECTED (no phantom over-pay)" -ForegroundColor Yellow
$rejected = $false
try { Round | Out-Null } catch { if ($_.Exception.Response.StatusCode.value__ -eq 400) { $rejected = $true } }
chk "round5 rejected (everyone already at the 30k cap)" $rejected
chk "balances unchanged after the rejected round (A and D still 30k)" ((CohortAll $A $CAP) -and (CohortAll $D $CAP))

# --- Cohort E joins late (before round 6) ---
$E = New-Cohort "E"
Write-Host "`n### Round 6: E catches up to 30k; everyone else stays capped at 30k" -ForegroundColor Yellow
$r6 = Round
chk "round6 stayed at the cap (installment 3)" ($r6.installmentNo -eq 3)
chk "E fully caught up to 30k" (CohortAll $E $CAP)
chk "A,B,C,D STILL exactly 30k (never past the cap)" ((CohortAll $A $CAP) -and (CohortAll $B $CAP) -and (CohortAll $C $CAP) -and (CohortAll $D $CAP))

# --- Final: every one of the 100 citizens is at exactly 30k, none over ---
Write-Host "`n### Final: all $total citizens at exactly 30k, none past the cap" -ForegroundColor Cyan
$allOk = $true; $over = 0
foreach ($coh in @($A,$B,$C,$D,$E)) { foreach ($p in $coh) { $bv = Bal $p; if ($bv -ne $CAP) { $allOk = $false }; if ($bv -gt $CAP) { $over++ } } }
chk "all $total citizens at exactly 30k" $allOk
chk "ZERO citizens received past the 30k cap" ($over -eq 0)

Write-Host "`n=========================================="
if ($script:fail -eq 0) { Write-Host "  5-COHORT CAP + CATCH-UP: PASS (all 5 cohorts end at exactly 30k, none over)" -ForegroundColor Green }
else { Write-Host "  5-COHORT CAP + CATCH-UP: FAIL ($script:fail checks failed)" -ForegroundColor Red }
Write-Host "=========================================="
if ($script:fail -gt 0) { exit 1 }
