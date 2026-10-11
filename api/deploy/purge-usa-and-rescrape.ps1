# Delete all USA lots and start a fresh Bid.cars crawl.
# Run as Administrator on the Windows API server:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\purge-usa-and-rescrape.ps1
#
# Before running: Chrome with VPN open, Bid.cars Cloudflare already passed.

$ErrorActionPreference = "Stop"

$AppDir = if ($env:APP_DIR) { $env:APP_DIR } else { "C:\mg-api" }
$ServiceName = if ($env:SERVICE_NAME) { $env:SERVICE_NAME } else { "mg-api" }
$apiDir = Join-Path $AppDir "api"
$Port = if ($env:API_PORT) { [int]$env:API_PORT } else { 80 }
$behindCaddy = Join-Path $apiDir "deploy\.behind-caddy"
if ((Test-Path $behindCaddy) -and -not $env:API_PORT) { $Port = 8080 }

Write-Host "==> pull latest code + restart (clears USA via purge-usa.flag)"
$env:APP_DIR = $AppDir
$env:SKIP_WEBSITE = "1"
& (Join-Path $apiDir "deploy\update-from-git.ps1")

Write-Host "==> wait for API"
$health = "http://127.0.0.1:$Port/health"
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-WebRequest -Uri $health -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 3
}
if (-not $ok) { throw "API not healthy at $health" }
Write-Host ($r.Content)

Write-Host "==> purge USA (idempotent, in case flag already ran)"
try {
  $purge = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/api/v1/lots/purge-region?region=usa" -TimeoutSec 120
  Write-Host ($purge | ConvertTo-Json -Compress)
} catch {
  Write-Host "purge-region endpoint not available yet (ok if flag already wiped USA): $_" -ForegroundColor Yellow
}

Write-Host "==> ensure 24/7 scraper is running (Bid.cars fills USA in background)"
try {
  $start = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/api/v1/scraper/start" -TimeoutSec 60
  Write-Host ($start | ConvertTo-Json -Depth 3 -Compress)
} catch {
  Write-Host "scraper/start: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "USA catalog wiped. Bid.cars will refill lots with car photos + estimated cost."
Write-Host "Keep Chrome + VPN + Bid.cars Cloudflare open on this machine."
Write-Host "Watch: Invoke-RestMethod http://127.0.0.1:$Port/api/v1/lots/meta"
Write-Host "Site:  http://91.149.133.54/avto/usa/"
