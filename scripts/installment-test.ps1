$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
$root = Split-Path $PSScriptRoot -Parent
$SCHEME = 2   # PM Awas (HOUSING) — clean installment history
$script:pass = 0; $script:fail = 0
function chk($n,$c){ if($c){Write-Host "  [PASS] $n" -ForegroundColor Green;$script:pass++}else{Write-Host "  [FAIL] $n" -ForegroundColor Red;$script:fail++} }
function P($p,$b,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Method Post -Uri "$base$p" -ContentType "application/json" -Body ($b|ConvertTo-Json -Depth 8) -Headers $h }
function G($p,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Uri "$base$p" -Headers $h }
function Citizen($pan){ $ph="9"+(Get-Random -Min 100000000 -Max 999999999); $s=P "/auth/signup" @{phone=$ph;password="citizen123";fullName="Inst $pan"} $null; $v=P "/auth/verify-otp" @{phone=$ph;code=$s.devCode} $null; return @{token=$v.tokens.accessToken} }
# Scheme 2 = HOUSING (PMAY-Gramin: kutcha/houseless + income <= 180000 + not excluded). Pick citizens
# who satisfy the full housing predicate — farmer-status alone no longer implies eligibility.
function PAN(){ (& node -e "const r=require('$($root -replace '\\','/')/packages/registry/data/registry.json');const f=r.filter(x=>(x.houseStatus===1||x.houseStatus===2)&&x.housingExcluded===0&&(x.income||0)<=180000);console.log(f[Math.floor(Math.random()*f.length)].pan)").Trim() }
function Bal($t){ $e = G "/me/entitlements" $t; $row = $e | Where-Object { $_.schemeId -eq $SCHEME }; if($row){[double]$row.entitlementFormatted}else{0} }
function Enroll($t){ $app = P "/applications" @{schemeId=$SCHEME;pan=(PAN)} $t; (P "/applications/$($app.id)/submit" @{} $t).status }
$admin = (P "/auth/login" @{phone="9000000000";password="admin12345"} $null).tokens.accessToken
$inst = (G "/schemes/$SCHEME" $admin).installmentFormatted; $instN = [double]$inst
Write-Host "Scheme $SCHEME installment = $inst e-rupee`n"

Write-Host "### Enroll citizen A, issue installment 1" -ForegroundColor Cyan
$A = Citizen (PAN); $sa = Enroll $A.token
if ($sa -ne "APPROVED") { Write-Host "A enroll -> $sa (eligibility blocks scheme $SCHEME?)" -ForegroundColor Red; exit 1 }
$r1 = P "/disbursement/rounds" @{schemeId=$SCHEME} $admin
chk "round1 is installment #1" ($r1.installmentNo -eq 1)
chk "A received installment 1 (balance = 1x)" ((Bal $A.token) -eq $instN)

Write-Host "### Issue installment 2 (A only enrollee)" -ForegroundColor Cyan
$r2 = P "/disbursement/rounds" @{schemeId=$SCHEME} $admin
chk "round2 is installment #2" ($r2.installmentNo -eq 2)
chk "round2 paid exactly 1 (A), not a re-pay of inst 1" ($r2.claimed -eq 1)
chk "A balance now 2x (got inst 2, not double inst 1)" ((Bal $A.token) -eq (2*$instN))

Write-Host "### Enroll citizen B AFTER installments 1 & 2" -ForegroundColor Cyan
$B = Citizen (PAN); $sb = Enroll $B.token
chk "B enrolled" ($sb -eq "APPROVED")
chk "B has no balance yet" ((Bal $B.token) -eq 0)

Write-Host "### Issue installment 3 -> A (due) + B (late enrollee, caught up)" -ForegroundColor Cyan
$r3 = P "/disbursement/rounds" @{schemeId=$SCHEME} $admin
chk "round3 is installment #3" ($r3.installmentNo -eq 3)
chk "round3 paid exactly 2 (A and the late enrollee B)" ($r3.claimed -eq 2)
chk "A balance now 3x (one more installment, not double)" ((Bal $A.token) -eq (3*$instN))
chk "B (enrolled late) fully caught up to 3x at the final installment" ((Bal $B.token) -eq (3*$instN))

Write-Host "`n=========================================="
Write-Host "  INSTALLMENT TEST: $script:pass passed, $script:fail failed" -ForegroundColor $(if($script:fail -eq 0){"Green"}else{"Red"})
Write-Host "=========================================="
if ($script:fail -gt 0) { exit 1 }
