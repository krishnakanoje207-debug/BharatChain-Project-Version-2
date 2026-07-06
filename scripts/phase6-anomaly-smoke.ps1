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
function NewCitizen($pan){
  $phone = "9" + (Get-Random -Min 100000000 -Max 999999999)
  $su = Post "/auth/signup" @{ phone=$phone; password="citizen123" }
  $vr = Post "/auth/verify-otp" @{ phone=$phone; code=$su.devCode }
  $t = $vr.tokens.accessToken
  $app = Post "/applications" @{ schemeId=0; pan=$pan } $t
  $sub = Post "/applications/$($app.id)/submit" @{} $t
  Write-Host "  citizen $phone (PAN $pan) -> $($sub.status)"
  return $t
}

Write-Host "=== 1. Enroll 3 farmer citizens (PM-Kisan) ==="
$pans = @("WMRTS2648Z","QLRXW9062G","PSPET5763R")
$tokens = @()
foreach ($p in $pans) { $tokens += (NewCitizen $p) }

Write-Host "=== 2. Admin disburse scheme 0 (all approved get an installment) ==="
$atoken = (Post "/auth/login" @{ phone="9000000000"; password="admin12345" }).tokens.accessToken
$round = Post "/disbursement/rounds" @{ schemeId=0 } $atoken
Write-Host "  $(J $round)"

Write-Host "=== 3. Pick the target vendor (Annapurna Agri Inputs) ==="
$vendors = GetR "/vendors?schemeId=0" $tokens[0]
$vendor = @($vendors)[0]
Write-Host "  $($vendor.name) $($vendor.address)"

Write-Host "=== 4. FAN-IN: 3 distinct citizens each pay the vendor ==="
for ($i=0; $i -lt 3; $i++) {
  $r = Post "/payments" @{ schemeId=0; vendorAddress=$vendor.address; amount="1000" } $tokens[$i]
  Write-Host "  citizen[$i] paid -> payment #$($r.onChainId) status=$($r.status)"
}

Write-Host "=== 5. VELOCITY: citizen[0] makes 4 more rapid payments ==="
for ($i=0; $i -lt 4; $i++) {
  $r = Post "/payments" @{ schemeId=0; vendorAddress=$vendor.address; amount="500" } $tokens[0]
  Write-Host "  rapid pay -> payment #$($r.onChainId)"
}

Write-Host "=== 6. Wait for Kafka consumer to process ==="
Start-Sleep -Seconds 5

Write-Host "=== 7. Admin views anomalies (expect FAN_IN + VELOCITY for the vendor) ==="
$anoms = GetR "/anomalies?status=OPEN" $atoken
foreach ($a in @($anoms)) {
  Write-Host "  [$($a.type)/$($a.severity)] $($a.message)"
}
$types = (@($anoms) | ForEach-Object { $_.type } | Sort-Object -Unique) -join ","
Write-Host "  types raised: $types"

Write-Host "=== 8. Admin notifications include fraud alerts? ==="
$notifs = GetR "/me/notifications" $atoken
$fraud = @($notifs | Where-Object { $_.type -eq "anomaly" })
Write-Host "  admin has $($fraud.Count) anomaly notification(s)"

Write-Host "=== 9. Resolve the first anomaly ==="
if (@($anoms).Count -gt 0) {
  $res = Post "/anomalies/$(@($anoms)[0].id)/resolve" @{} $atoken
  Write-Host "  resolved $($res.type) -> status=$($res.status)"
}

Write-Host "`n=== ANOMALY SMOKE COMPLETE ===" -ForegroundColor Green
