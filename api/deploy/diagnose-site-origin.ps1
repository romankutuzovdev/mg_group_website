# Diagnose where https://mg-group.by actually points vs local Windows site.
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\diagnose-site-origin.ps1

$ErrorActionPreference = "Continue"
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {}

Write-Host "==> DNS mg-group.by"
try {
  Resolve-DnsName mg-group.by -ErrorAction Stop | Format-Table Name, Type, IPAddress, NameHost -AutoSize
} catch {
  nslookup mg-group.by
}

Write-Host "==> local Windows cabinet chunk"
try {
  $local = (Invoke-WebRequest "http://127.0.0.1/cabinet/" -UseBasicParsing -TimeoutSec 15).Content
  [regex]::Matches($local, '_app-[a-f0-9]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
} catch {
  Write-Host "LOCAL FAIL: $_" -ForegroundColor Red
}

Write-Host "==> http://91.149.133.54 cabinet chunk"
try {
  $ip = (Invoke-WebRequest "http://91.149.133.54/cabinet/" -UseBasicParsing -TimeoutSec 15).Content
  [regex]::Matches($ip, '_app-[a-f0-9]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
} catch {
  Write-Host "IP FAIL: $_" -ForegroundColor Red
}

Write-Host "==> https://mg-group.by cabinet chunk"
try {
  $https = (Invoke-WebRequest "https://mg-group.by/cabinet/" -UseBasicParsing -TimeoutSec 20).Content
  [regex]::Matches($https, '_app-[a-f0-9]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
  if ($https -match 'cloudflare|cf-ray|pages\.dev') { Write-Host "(cloudflare markers in body/headers likely)" }
} catch {
  Write-Host "HTTPS FAIL: $_" -ForegroundColor Yellow
  Write-Host "Try from your Mac/PC browser DevTools > Network > document cabinet/"
}

Write-Host ""
Write-Host "Expected: local and IP show _app-c5e9768... (or current build)."
Write-Host "If browser still shows 621-0beca1e... then DNS/CDN is NOT this Windows out/."
