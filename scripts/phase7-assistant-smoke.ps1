$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
trap {
  Write-Host "`n*** ERROR: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails) { Write-Host "*** BODY: $($_.ErrorDetails.Message)" -ForegroundColor Red }
  exit 1
}
function Post($path, $body, $token){
  $h = @{}; if($token){ $h["Authorization"] = "Bearer $token" }
  Invoke-RestMethod -Method Post -Uri "$base$path" -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 8) -Headers $h
}
function GetR($path, $token){
  $h = @{}; if($token){ $h["Authorization"] = "Bearer $token" }
  Invoke-RestMethod -Method Get -Uri "$base$path" -Headers $h
}
function Ask($token, $msg, $lang){
  $body = @{ message=$msg }; if($lang){ $body.language=$lang }
  $r = Post "/assistant/chat" $body $token
  Write-Host "Q: $msg" -ForegroundColor Cyan
  Write-Host "   [$($r.provider)/$($r.language)] $($r.answer)`n"
}

Write-Host "=== 1. Fresh citizen with NO data (cold start) ==="
$phone = "9" + (Get-Random -Min 100000000 -Max 999999999)
$su = Post "/auth/signup" @{ phone=$phone; password="citizen123"; fullName="Anita Devi" }
$vr = Post "/auth/verify-otp" @{ phone=$phone; code=$su.devCode }
$t = $vr.tokens.accessToken
Ask $t "Hello, what can you do?"
Ask $t "What is the status of my applications?"
Ask $t "Which government schemes can I apply for?"

Write-Host "=== 1b. Platform-explanation questions (knowledge base) ==="
Ask $t "What is this website about?"
Ask $t "How does payment work?"
Ask $t "What is e-rupee?"
Ask $t "Is my personal data safe?"
Ask $t "How does it stop corruption?"

Write-Host "=== 2. Give the citizen real data: enroll -> disburse -> pay ==="
$app = Post "/applications" @{ schemeId=0; pan="BFMTK5302Q" } $t
$sub = Post "/applications/$($app.id)/submit" @{} $t
Write-Host "  enrollment: $($sub.status)"
$atoken = (Post "/auth/login" @{ phone="9000000000"; password="admin12345" }).tokens.accessToken
Post "/disbursement/rounds" @{ schemeId=0 } $atoken | Out-Null
$vendors = GetR "/vendors?schemeId=0" $t
$pay = Post "/payments" @{ schemeId=0; vendorAddress=(@($vendors)[0].address); amount="3500" } $t
Write-Host "  paid: $($pay.amountFormatted) to $($pay.vendorName)`n"

Write-Host "=== 3. Now the assistant is grounded in the citizen's real data ==="
Ask $t "What is the status of my applications?"
Ask $t "How much balance do I have and in which scheme?"
Ask $t "Show my recent payments."
Ask $t "Do I have any notifications?"

Write-Host "=== 4. Multilingual request (Hindi) ==="
Ask $t "How much balance do I have?" "hi"

Write-Host "=== 5. Suggestions + languages endpoints ==="
$sg = GetR "/assistant/suggestions" $t
Write-Host "  suggestions: $($sg.suggestions.Count) starter prompts"
$langs = GetR "/assistant/languages" $t
Write-Host "  languages: $((@($langs) | ForEach-Object { $_.code }) -join ', ')"

Write-Host "`n=== ASSISTANT SMOKE COMPLETE ===" -ForegroundColor Green
