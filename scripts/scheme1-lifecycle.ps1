$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
$script:pass = 0; $script:fail = 0
function chk($name, $cond) {
  if ($cond) { Write-Host "  [PASS] $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  [FAIL] $name" -ForegroundColor Red; $script:fail++ }
}
function Post($p, $b, $t) { $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Method Post -Uri "$base$p" -ContentType "application/json" -Body ($b|ConvertTo-Json -Depth 8) -Headers $h }
function Get-($p, $t) { $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Uri "$base$p" -Headers $h }
function NewCitizen($pan) {
  $ph="9"+(Get-Random -Min 100000000 -Max 999999999)
  $su=Post "/auth/signup" @{phone=$ph;password="citizen123";fullName="Citizen $pan"} $null
  $vr=Post "/auth/verify-otp" @{phone=$ph;code=$su.devCode} $null
  return @{ token=$vr.tokens.accessToken; phone=$ph }
}
$root = Split-Path $PSScriptRoot -Parent
# Scheme 1 = EDUCATION (Post-Matric: enrolled student + reserved caste + income under that caste's
# cap). Pick a citizen satisfying the full education predicate — farmer-status alone does not qualify.
$pan = (& node -e "const r=require('$($root -replace '\\','/')/packages/registry/data/registry.json');const caps={1:250000,2:250000,3:150000,4:100000,5:200000};const f=r.filter(x=>x.isStudent===1&&caps[x.caste]!==undefined&&(x.income||0)<=caps[x.caste]);console.log(f[Math.floor(Math.random()*f.length)].pan)").Trim()

Write-Host "`n=== Scheme 1 (Vidya Lakshmi Scholarship) end-to-end, PAN $pan ==="
$c = NewCitizen $pan
$app = Post "/applications" @{schemeId=1;pan=$pan} $c.token
$sub = Post "/applications/$($app.id)/submit" @{} $c.token
chk "enrolled in scheme 1 via ZK proof (APPROVED)" ($sub.status -eq "APPROVED")

$admin = (Post "/auth/login" @{phone="9000000000";password="admin12345"} $null).tokens.accessToken
$round = Post "/disbursement/rounds" @{schemeId=1} $admin
chk "scheme-1 disbursal round, 0 failures (claimed $($round.claimed)/$($round.beneficiaryCount), inst #$($round.installmentNo))" ($round.claimed -eq $round.beneficiaryCount -and $round.failed -eq 0)
$ent = Get- "/me/entitlements" $c.token
$s1 = @($ent | Where-Object { $_.schemeId -eq 1 })[0]
chk "scheme-1 entitlement = 50000 (one installment)" ($s1.entitlementFormatted -eq "50000.0")

Write-Host "`n--- pay an EDU/TECH vendor (scheme-1 allowed categories) ---"
$vendors = Get- "/vendors?schemeId=1" $c.token
chk "scheme-1 vendor list non-empty (EDU + TECH)" (@($vendors).Count -ge 1)
$v = @($vendors)[0]
$pay = Post "/payments" @{schemeId=1;vendorAddress=$v.address;amount="20000"} $c.token
chk "payment to $($v.name) PAID" ($pay.status -eq "PAID")
$conf = Post "/payments/$($pay.id)/confirm" @{} $c.token
chk "delivery confirmed -> DELIVERED" ($conf.status -eq "DELIVERED")
$ent2 = Get- "/me/entitlements" $c.token
$s1b = @($ent2 | Where-Object { $_.schemeId -eq 1 })[0]
chk "scheme-1 entitlement after 20k pay = 30000" ($s1b.entitlementFormatted -eq "30000.0")

Write-Host "`n--- category gate: an AGRI vendor must be rejected for scheme 1 ---"
$agri = Get- "/vendors?category=AGRI_INPUT" $c.token
try { Post "/payments" @{schemeId=1;vendorAddress=(@($agri)[0].address);amount="100"} $c.token | Out-Null; chk "AGRI vendor blocked for scheme 1" $false }
catch { chk "AGRI vendor blocked for scheme 1 (400)" $true }

Write-Host "`n--- redemption via the SEEDED RBI admin (9000000001) ---"
$red = Post "/redemptions" @{vendorAddress=$v.address;amount="20000";itrNumber="ITR-EDU-001";bankAccount="SBI-1234"} $admin
chk "redemption filed PENDING" ($red.status -eq "PENDING")
$rbi = (Post "/auth/login" @{phone="9000000001";password="rbiadmin12345"} $null).tokens.accessToken
$appr = Post "/redemptions/$($red.id)/approve" @{} $rbi
chk "seeded RBI approved -> burn + NEFT payout" ($appr.status -eq "APPROVED" -and $appr.payoutReference -match "^NEFT-")

Write-Host "`n=========================================="
Write-Host "  SCHEME 1 LIFECYCLE: $script:pass passed, $script:fail failed" -ForegroundColor $(if($script:fail -eq 0){"Green"}else{"Red"})
Write-Host "=========================================="
if ($script:fail -gt 0) { exit 1 }
