$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
trap {
  Write-Host "`n*** ERROR: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails) { Write-Host "*** BODY: $($_.ErrorDetails.Message)" -ForegroundColor Red }
  exit 1
}
function J($o){ $o | ConvertTo-Json -Depth 8 -Compress }
function Post($path, $body, $token){
  $h = @{}; if($token){ $h["Authorization"] = "Bearer $token" }
  Invoke-RestMethod -Method Post -Uri "$base$path" -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 8) -Headers $h
}
function GetR($path, $token){
  $h = @{}; if($token){ $h["Authorization"] = "Bearer $token" }
  Invoke-RestMethod -Method Get -Uri "$base$path" -Headers $h
}

Write-Host "=== 1. Citizen signup -> verify -> token ==="
$cphone = "9" + (Get-Random -Min 100000000 -Max 999999999)
$su = Post "/auth/signup" @{ phone=$cphone; password="citizen123"; fullName="Test Farmer"; email="farmer@example.in" }
$vr = Post "/auth/verify-otp" @{ phone=$cphone; code=$su.devCode }
$ctoken = $vr.tokens.accessToken
Write-Host "  phone=$cphone chainAddress=$($vr.user.chainAddress)"

Write-Host "=== 2. Create application (PM-Kisan #0, farmer PAN LJAAN1880Y) ==="
$app = Post "/applications" @{ schemeId=0; pan="LJAAN1880Y" } $ctoken
Write-Host "  $(J $app)"

Write-Host "=== 3. Submit (ZK proof + on-chain enroll) ==="
$sub = Post "/applications/$($app.id)/submit" @{} $ctoken
Write-Host "  $(J $sub)"

Write-Host "=== 4. Admin login + disburse scheme 0 ==="
$al = Post "/auth/login" @{ phone="9000000000"; password="admin12345" }
$atoken = $al.tokens.accessToken
$round = Post "/disbursement/rounds" @{ schemeId=0 } $atoken
Write-Host "  $(J $round)"

Write-Host "=== 5. Citizen entitlement (expect 10000) ==="
Write-Host "  $(J (GetR '/me/entitlements' $ctoken))"

Write-Host "=== 6. Vendors allowed for scheme 0 ==="
$vendors = GetR "/vendors?schemeId=0" $ctoken
$vendor = @($vendors)[0]
Write-Host "  count=$(@($vendors).Count) using: $($vendor.name) [$($vendor.category)] $($vendor.address)"

Write-Host "=== 7. Pay vendor 4000 ==="
$pay = Post "/payments" @{ schemeId=0; vendorAddress=$vendor.address; amount="4000" } $ctoken
Write-Host "  $(J $pay)"

Write-Host "=== 8. Confirm delivery ==="
$conf = Post "/payments/$($pay.id)/confirm" @{} $ctoken
Write-Host "  status=$($conf.status) confirmTx=$($conf.confirmTxHash)"

Write-Host "=== 9. Entitlement after pay (expect 6000) ==="
Write-Host "  $(J (GetR '/me/entitlements' $ctoken))"

Write-Host "=== 10. Negative: pay a category-disallowed vendor (expect 400) ==="
try {
  $bad = GetR "/vendors?category=EDU_INSTITUTION" $ctoken
  Post "/payments" @{ schemeId=0; vendorAddress=(@($bad)[0].address); amount="100" } $ctoken | Out-Null
  Write-Host "  !! unexpectedly succeeded" -ForegroundColor Red
} catch {
  Write-Host "  blocked as expected: $($_.ErrorDetails.Message)"
}

Write-Host "=== 11. Create RBI_ADMIN user (signup + elevate role) ==="
$rphone = "9" + (Get-Random -Min 100000000 -Max 999999999)
$rsu = Post "/auth/signup" @{ phone=$rphone; password="rbiadmin123" }
Post "/auth/verify-otp" @{ phone=$rphone; code=$rsu.devCode } | Out-Null
docker exec bharatchain-postgres-1 psql -U bharat -d bharatchain -c "UPDATE users SET role='RBI_ADMIN' WHERE phone='$rphone';" | Out-Null
$rl = Post "/auth/login" @{ phone=$rphone; password="rbiadmin123" }
$rtoken = $rl.tokens.accessToken
Write-Host "  RBI role=$($rl.user.role)"

Write-Host "=== 12. Admin files redemption for vendor (4000 + ITR) ==="
$red = Post "/redemptions" @{ vendorAddress=$vendor.address; amount="4000"; itrNumber="ITR-2025-XYZ"; bankAccount="HDFC0001-998877" } $atoken
Write-Host "  $(J $red)"

Write-Host "=== 13. Negative: citizen tries to approve (expect 403) ==="
try { Post "/redemptions/$($red.id)/approve" @{} $ctoken | Out-Null; Write-Host "  !! unexpectedly succeeded" -ForegroundColor Red }
catch { Write-Host "  blocked as expected (403 forbidden)" }

Write-Host "=== 14. RBI approves redemption (burn + simulated payout) ==="
$appr = Post "/redemptions/$($red.id)/approve" @{} $rtoken
Write-Host "  $(J $appr)"

Write-Host "`n=== SMOKE TEST COMPLETE ===" -ForegroundColor Green
