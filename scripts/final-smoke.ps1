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

# A fresh farmer identity each run (the on-chain nullifier blocks re-enrolling one).
$root = Split-Path $PSScriptRoot -Parent
$farmerPan = (& node -e "const r=require('$($root -replace '\\','/')/packages/registry/data/registry.json');const f=r.filter(x=>x.profession===1);console.log(f[Math.floor(Math.random()*f.length)].pan)").Trim()

Write-Host "`n=== 1. Public scheme browse (no auth) ==="
$groups = Get- "/schemes" $null
chk "3 scheme categories returned" ((@($groups)).Count -eq 3)

Write-Host "`n=== 2. Farmer: signup -> apply -> ZK enroll (PAN $farmerPan) ==="
$farmer = NewCitizen $farmerPan
$app = Post "/applications" @{schemeId=0;pan=$farmerPan} $farmer.token
$sub = Post "/applications/$($app.id)/submit" @{} $farmer.token
chk "farmer APPROVED via ZK proof" ($sub.status -eq "APPROVED")

Write-Host "`n=== 3. Non-farmer rejected ==="
$nf = NewCitizen "DYCNH0035D"
$napp = Post "/applications" @{schemeId=0;pan="DYCNH0035D"} $nf.token
$nsub = Post "/applications/$($napp.id)/submit" @{} $nf.token
chk "non-farmer REJECTED (proof fails)" ($nsub.status -eq "REJECTED")

Write-Host "`n=== 4. Admin disburse scheme 0 ==="
$admin = (Post "/auth/login" @{phone="9000000000";password="admin12345"} $null).tokens.accessToken
$round = Post "/disbursement/rounds" @{schemeId=0} $admin
chk "round disbursed all beneficiaries, 0 failures (claimed $($round.claimedCount)/$($round.beneficiaryCount))" ($round.beneficiaryCount -ge 1 -and $round.claimedCount -eq $round.beneficiaryCount -and $round.failed -eq 0)
# A fresh enrollee is caught up to the FULL cumulative entitlement (installmentNo x 10000),
# so this stays correct on repeat runs against the same deployment.
$expect = [decimal]$round.installmentNo * 10000
$ent = Get- "/me/entitlements" $farmer.token
chk "farmer entitlement = $expect (installment level $($round.installmentNo))" ([decimal]$ent[0].entitlementFormatted -eq $expect)

Write-Host "`n=== 5. Token app: pay vendor + confirm delivery ==="
$vendors = Get- "/vendors?schemeId=0" $farmer.token
$annapurna = @($vendors)[0]
$pay = Post "/payments" @{schemeId=0;vendorAddress=$annapurna.address;amount="4000"} $farmer.token
chk "payment PAID" ($pay.status -eq "PAID")
$conf = Post "/payments/$($pay.id)/confirm" @{} $farmer.token
chk "delivery confirmed -> DELIVERED" ($conf.status -eq "DELIVERED")
$expectAfter = $expect - 4000
$ent2 = Get- "/me/entitlements" $farmer.token
chk "entitlement after pay = $expectAfter" ([decimal]$ent2[0].entitlementFormatted -eq $expectAfter)

Write-Host "`n=== 6. Category gate (negative) ==="
$edu = Get- "/vendors?category=EDU_INSTITUTION" $farmer.token
try { Post "/payments" @{schemeId=0;vendorAddress=(@($edu)[0].address);amount="100"} $farmer.token | Out-Null; chk "EDU vendor blocked for agri scheme" $false }
catch { chk "EDU vendor blocked for agri scheme (400)" $true }

Write-Host "`n=== 7. Assistant (platform KB + grounded) ==="
$a1 = Post "/assistant/chat" @{message="What is BharatChain?"} $farmer.token
chk "assistant explains platform" ($a1.answer -match "blockchain-based welfare")
$a2 = Post "/assistant/chat" @{message="How much balance do I have?"} $farmer.token
chk "assistant grounded balance ($expectAfter)" ($a2.answer -match "$expectAfter")

Write-Host "`n=== 8. Fraud monitor: velocity ==="
for ($i=0;$i -lt 4;$i++){ Post "/payments" @{schemeId=0;vendorAddress=$annapurna.address;amount="500"} $farmer.token | Out-Null }
Start-Sleep -Seconds 5
$anoms = Get- "/anomalies?status=OPEN" $admin
chk "VELOCITY anomaly raised" (@($anoms | Where-Object { $_.type -eq "VELOCITY" }).Count -ge 1)

Write-Host "`n=== 9. RBAC: citizen blocked from /anomalies ==="
try { Get- "/anomalies" $farmer.token | Out-Null; chk "citizen blocked from admin endpoint" $false }
catch { chk "citizen blocked from admin endpoint (403)" $true }

Write-Host "`n=== 10. Redemption: admin files -> RBI approves ==="
$red = Post "/redemptions" @{vendorAddress=$annapurna.address;amount="4000";itrNumber="ITR-2025-FINAL";bankAccount="HDFC-9988"} $admin
chk "redemption filed PENDING" ($red.status -eq "PENDING")
$rphone="9"+(Get-Random -Min 100000000 -Max 999999999)
$rsu=Post "/auth/signup" @{phone=$rphone;password="rbiadmin123"} $null
Post "/auth/verify-otp" @{phone=$rphone;code=$rsu.devCode} $null | Out-Null
docker exec bharatchain-postgres-1 psql -U bharat -d bharatchain -c "UPDATE users SET role='RBI_ADMIN' WHERE phone='$rphone';" | Out-Null
$rbi = (Post "/auth/login" @{phone=$rphone;password="rbiadmin123"} $null).tokens.accessToken
$appr = Post "/redemptions/$($red.id)/approve" @{} $rbi
chk "RBI approved -> burned + NEFT payout" ($appr.status -eq "APPROVED" -and $appr.payoutReference -match "^NEFT-")

Write-Host "`n=========================================="
Write-Host "  FINAL SMOKE: $script:pass passed, $script:fail failed" -ForegroundColor $(if($script:fail -eq 0){"Green"}else{"Red"})
Write-Host "=========================================="
if ($script:fail -gt 0) { exit 1 }
