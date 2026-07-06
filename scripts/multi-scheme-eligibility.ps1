$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
$script:pass = 0; $script:fail = 0
function chk($name, $cond) {
  if ($cond) { Write-Host "  [PASS] $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  [FAIL] $name" -ForegroundColor Red; $script:fail++ }
}
function Post($p, $b, $t) { $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Method Post -Uri "$base$p" -ContentType "application/json" -Body ($b|ConvertTo-Json -Depth 8) -Headers $h }
function Get-($p, $t) { $h=@{}; if($t){$h.Authorization="Bearer $t"}; Invoke-RestMethod -Uri "$base$p" -Headers $h }

$root = Split-Path $PSScriptRoot -Parent
# One farmer identity, used across multiple schemes. Must be eligible for BOTH scheme 0 (agriculture =
# farmer) AND scheme 1 (education = Post-Matric: enrolled student + reserved caste + income under that
# caste's cap) — the per-scheme predicate means farmer-status alone no longer qualifies for education.
$pan = (& node -e "const r=require('$($root -replace '\\','/')/packages/registry/data/registry.json');const caps={1:250000,2:250000,3:150000,4:100000,5:200000};const f=r.filter(x=>x.profession===1&&x.isStudent===1&&caps[x.caste]!==undefined&&(x.income||0)<=caps[x.caste]);console.log(f[Math.floor(Math.random()*f.length)].pan)").Trim()

$ph="9"+(Get-Random -Min 100000000 -Max 999999999)
$su=Post "/auth/signup" @{phone=$ph;password="citizen123";fullName="Multi $pan"} $null
$tok=(Post "/auth/verify-otp" @{phone=$ph;code=$su.devCode} $null).tokens.accessToken

Write-Host "`n=== ONE citizen (PAN $pan), TWO schemes ==="
$a0 = Post "/applications" @{schemeId=0;pan=$pan} $tok
$s0 = Post "/applications/$($a0.id)/submit" @{} $tok
chk "enrolled in scheme 0 (PM-Kisan), nullifier_0 = Poseidon(pan,0)" ($s0.status -eq "APPROVED")

$a1 = Post "/applications" @{schemeId=1;pan=$pan} $tok
$s1 = Post "/applications/$($a1.id)/submit" @{} $tok
chk "SAME person also enrolled in scheme 1 (Vidya Lakshmi), nullifier_1 = Poseidon(pan,1)" ($s1.status -eq "APPROVED")

Write-Host "`n=== but the SAME scheme cannot be re-enrolled (anti double-dip) ==="
try {
  $a0b = Post "/applications" @{schemeId=0;pan=$pan} $tok
  Post "/applications/$($a0b.id)/submit" @{} $tok | Out-Null
  chk "re-enrol scheme 0 blocked" $false
} catch {
  chk "re-enrol scheme 0 blocked (already enrolled / nullifier_0 used)" $true
}

Write-Host "`n=== on-chain: this address is enrolled in BOTH schemes ==="
$me = Get- "/applications/mine" $tok
$schemes = @($me | ForEach-Object { $_.schemeId } | Sort-Object -Unique)
chk "citizen holds enrollments in 2 distinct schemes on-chain ($($schemes -join ', '))" ($schemes.Count -eq 2)

Write-Host "`n=========================================="
Write-Host "  MULTI-SCHEME: $script:pass passed, $script:fail failed" -ForegroundColor $(if($script:fail -eq 0){"Green"}else{"Red"})
Write-Host "=========================================="
if ($script:fail -gt 0) { exit 1 }
