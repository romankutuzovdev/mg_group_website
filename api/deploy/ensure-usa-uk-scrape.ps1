# Bring USA (Bid.cars) and UK (Copart UK) back into the catalog.
# Run on the Windows API server after Chrome CDP is up and VPN is on:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\ensure-usa-uk-scrape.ps1

$ErrorActionPreference = "Stop"
$AppDir = if ($env:APP_DIR) { $env:APP_DIR } else { "C:\mg-api" }
$Port = if ($env:API_PORT) { [int]$env:API_PORT } else { 80 }
$behindCaddy = Join-Path $AppDir "api\deploy\.behind-caddy"
if ((Test-Path $behindCaddy) -and -not $env:API_PORT) { $Port = 8080 }
$base = "http://127.0.0.1:$Port"

Write-Host "==> 1) Chrome CDP on 9223"
try {
  $cdp = Invoke-WebRequest -Uri "http://127.0.0.1:9223/json/version" -UseBasicParsing -TimeoutSec 5
  Write-Host "  OK $($cdp.StatusCode)"
} catch {
  Write-Host "  CDP down — start headed Chrome first:" -ForegroundColor Yellow
  Write-Host "  powershell -ExecutionPolicy Bypass -File $AppDir\api\deploy\start-headed-chrome.ps1"
  throw "Chrome CDP is required for Bid.cars and Copart UK"
}

Write-Host "==> 2) Pull latest + restart mg-api"
& (Join-Path $AppDir "api\deploy\update-from-git.ps1")

Write-Host "==> 3) Wait for health"
$ok = $false
for ($i = 1; $i -le 20; $i++) {
  try {
    $h = Invoke-WebRequest -Uri "$base/health" -UseBasicParsing -TimeoutSec 8
    Write-Host "  health $($h.StatusCode) $($h.Content)"
    $ok = $true
    break
  } catch {
    Start-Sleep -Seconds 3
  }
}
if (-not $ok) { throw "API health failed at $base/health" }

Write-Host "==> 4) Start scraper loop (if stopped)"
try {
  Invoke-WebRequest -Uri "$base/api/v1/scraper/start" -Method POST -UseBasicParsing -TimeoutSec 30 | Out-Null
  Write-Host "  scraper start OK"
} catch {
  Write-Host "  scraper start: $_" -ForegroundColor Yellow
}

Write-Host "==> 5) One-shot Bid.cars (USA) + Copart UK"
foreach ($src in @("bidcars", "copart_uk", "salvage_market")) {
  Write-Host "  run-once $src ..."
  try {
    $r = Invoke-WebRequest -Uri "$base/api/v1/scraper/run-once?sources=$src" -Method POST -UseBasicParsing -TimeoutSec 120
    Write-Host "  $src → $($r.StatusCode) $($r.Content.Substring(0, [Math]::Min(240, $r.Content.Length)))"
  } catch {
    Write-Host "  $src failed (may still run in background loop): $_" -ForegroundColor Yellow
  }
}

Write-Host "==> 6) Catalog counts"
try {
  $meta = Invoke-RestMethod -Uri "$base/api/v1/lots/meta" -TimeoutSec 40
  Write-Host ("  usa={0} uk={1} korea={2} china={3} total={4}" -f `
    $meta.counts_by_region.usa, $meta.counts_by_region.uk, `
    $meta.counts_by_region.korea, $meta.counts_by_region.china, $meta.total)
  Write-Host ("  sources: " + ($meta.counts_by_source | ConvertTo-Json -Compress))
} catch {
  Write-Host "  meta: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Keep Chrome open on Bid.cars + Copart UK. Pass Cloudflare if asked."
Write-Host "USA cards appear as Bid.cars seeds search pages; UK needs VPN + Copart login."
