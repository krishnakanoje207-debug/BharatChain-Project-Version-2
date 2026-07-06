$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
$root = Split-Path $PSScriptRoot -Parent
$script:pass = 0; $script:flag = 0
function secure($n) { Write-Host "  [SECURE] $n" -ForegroundColor Green; $script:pass++ }
function flag($n)   { Write-Host "  [FLAG]   $n" -ForegroundColor Red;   $script:flag++ }
function denies($n, $expect, $blk) {
  try { & $blk | Out-Null; flag "$n (expected $expect, SUCCEEDED)" }
  catch { $c = $_.Exception.Response.StatusCode.value__; if ($c -eq $expect) { secure "$n -> $c" } else { flag "$n (got $c, expected $expect)" } }
}
function P($p,$b,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Method Post -Uri "$base$p" -ContentType "application/json" -Body ($b|ConvertTo-Json -Depth 8) -Headers $h }
function G($p,$t){ $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Uri "$base$p" -Headers $h }
function Citizen($pan){ $ph="9"+(Get-Random -Min 100000000 -Max 999999999); $s=P "/auth/signup" @{phone=$ph;password="citizen123";fullName="P2 $pan"} $null; $v=P "/auth/verify-otp" @{phone=$ph;code=$s.devCode} $null; return @{token=$v.tokens.accessToken;phone=$ph;refresh=$v.tokens.refreshToken} }
$farmerPan = (& node -e "const r=require('$($root -replace '\\','/')/packages/registry/data/registry.json');const f=r.filter(x=>x.profession===1);console.log(f[Math.floor(Math.random()*f.length)].pan)").Trim()

Write-Host "`n### A. Rate limiting & lockout" -ForegroundColor Cyan
$op = "9"+(Get-Random -Min 100000000 -Max 999999999)
$otpBlocked = $false
for ($i=1;$i -le 7;$i++){ try { P "/auth/signup" @{phone=$op;password="password1"} $null | Out-Null } catch { if ($_.Exception.Response.StatusCode.value__ -eq 429){ $otpBlocked=$true; break } } }
if ($otpBlocked) { secure "OTP request rate-limited (429)" } else { flag "OTP requests NOT rate-limited" }

$lc = Citizen $farmerPan
for ($i=1;$i -le 5;$i++){ try { P "/auth/login" @{phone=$lc.phone;password="WRONGpass"} $null | Out-Null } catch {} }
denies "account locked after repeated bad logins" 429 { P "/auth/login" @{phone=$lc.phone;password="WRONGpass"} $null }

Write-Host "`n### B. Token security" -ForegroundColor Cyan
$rc = Citizen $farmerPan
$newTokens = P "/auth/refresh" @{refreshToken=$rc.refresh} $null
secure "refresh issued new tokens"
denies "old refresh token rejected after rotation" 401 { P "/auth/refresh" @{refreshToken=$rc.refresh} $null }
$tampered = $rc.token.Substring(0, $rc.token.Length-3) + "xyz"
denies "tampered JWT rejected" 401 { G "/me/entitlements" $tampered }

Write-Host "`n### C. Assistant DTO limits" -ForegroundColor Cyan
$f = Citizen $farmerPan
denies "assistant message over 1000 chars" 400 { P "/assistant/chat" @{message=("x"*1100)} $f.token }
denies "assistant unsupported language code" 400 { P "/assistant/chat" @{message="hi";language="zz"} $f.token }

Write-Host "`n### D. Redemption & disbursement guards" -ForegroundColor Cyan
$admin = (P "/auth/login" @{phone="9000000000";password="admin12345"} $null).tokens.accessToken
# a vendor with no delivered value -> exceeds redeemable
$krishi = (@(G "/vendors?schemeId=0" $admin) | Where-Object { $_.name -like "Krishi*" })[0]
if (-not $krishi) { $krishi = @(G "/vendors?schemeId=0" $admin)[1] }
denies "redemption exceeding redeemable blocked" 400 { P "/redemptions" @{vendorAddress=$krishi.address;amount="999999";itrNumber="ITR-X"} $admin }
denies "disbursement on unknown scheme" 404 { P "/disbursement/rounds" @{schemeId=999} $admin }
denies "resolve unknown anomaly id" 404 { P "/anomalies/00000000-0000-0000-0000-000000000000/resolve" @{} $admin }

# create RBI to test reject-then-approve on a real redemption
$annapurna = (@(G "/vendors?schemeId=0" $admin) | Where-Object { $_.name -like "Annapurna*" })[0]
# fund + deliver to Annapurna so it has redeemable
$ff = Citizen $farmerPan
$ap = P "/applications" @{schemeId=0;pan=$farmerPan} $ff.token
$as = P "/applications/$($ap.id)/submit" @{} $ff.token
if ($as.status -eq "APPROVED") {
  P "/disbursement/rounds" @{schemeId=0} $admin | Out-Null
  $pp = P "/payments" @{schemeId=0;vendorAddress=$annapurna.address;amount="1500"} $ff.token
  P "/payments/$($pp.id)/confirm" @{} $ff.token | Out-Null
  $red = P "/redemptions" @{vendorAddress=$annapurna.address;amount="1500";itrNumber="ITR-RJ"} $admin
  $rp = "9"+(Get-Random -Min 100000000 -Max 999999999)
  $rs = P "/auth/signup" @{phone=$rp;password="rbiadmin123"} $null
  P "/auth/verify-otp" @{phone=$rp;code=$rs.devCode} $null | Out-Null
  docker exec bharatchain-postgres-1 psql -U bharat -d bharatchain -c "UPDATE users SET role='RBI_ADMIN' WHERE phone='$rp';" | Out-Null
  $rbi = (P "/auth/login" @{phone=$rp;password="rbiadmin123"} $null).tokens.accessToken
  P "/redemptions/$($red.id)/reject" @{reason="test"} $rbi | Out-Null
  denies "approve a REJECTED redemption blocked" 400 { P "/redemptions/$($red.id)/approve" @{} $rbi }
} else { flag "redemption setup enroll failed ($($as.status))" }

Write-Host "`n=========================================="
Write-Host "  PROBE2: $script:pass secure, $script:flag flagged" -ForegroundColor $(if($script:flag -eq 0){"Green"}else{"Red"})
Write-Host "=========================================="
if ($script:flag -gt 0) { exit 1 }
