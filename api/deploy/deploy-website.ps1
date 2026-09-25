# Build Next.js static site into <repo>/out and restart mg-api (serves it).
# Run on Windows Server (Node 20+ required):
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\deploy-website.ps1
#
# Optional env:
#   APP_DIR=C:\mg-api
#   API_URL=http://127.0.0.1          (SSG only - fetch catalog during build)
#   SERVICE_NAME=mg-api
#   SKIP_SERVICE_RESTART=1
#
# Do NOT set NEXT_PUBLIC_API_URL to http://IP - that causes Mixed Content on
# https://mg-group.by (browser treats mg-group.by and 91.149.x.x as different origins).
# Client JS always uses same-origin /api/v1/...

$ErrorActionPreference = "Stop"

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

$AppDir = if ($env:APP_DIR) { $env:APP_DIR } else { "C:\mg-api" }
$ServiceName = if ($env:SERVICE_NAME) { $env:SERVICE_NAME } else { "mg-api" }
# Build-time fetch only (Node on this machine). Prefer loopback.
$ApiUrl = if ($env:API_URL) { $env:API_URL } else { "http://127.0.0.1" }

Refresh-Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js not found. Install Node 20 LTS: https://nodejs.org/ then reopen PowerShell."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm not found (install Node.js LTS)."
}

if (-not (Test-Path (Join-Path $AppDir "package.json"))) {
  throw "package.json not found in $AppDir"
}

Set-Location $AppDir

Write-Host "==> npm ci"
npm ci

Write-Host "==> next build (SSG API_URL=$ApiUrl; browser = same-origin /api)"
$env:API_URL = $ApiUrl
Remove-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
$env:SEO_AUCTION_SSG_LIMIT = "0"
$env:SEO_AUCTION_SITEMAP_LIMIT = if ($env:SEO_AUCTION_SITEMAP_LIMIT) { $env:SEO_AUCTION_SITEMAP_LIMIT } else { "500" }
npm run build

$outDir = Join-Path $AppDir "out"
if (-not (Test-Path (Join-Path $outDir "index.html"))) {
  throw "Build failed: $outDir\index.html missing"
}

Write-Host "==> out ready: $outDir"

if ($env:SKIP_SERVICE_RESTART -eq "1") {
  Write-Host "==> skip service restart (caller will restart)"
} else {
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc) {
    Write-Host "==> restart $ServiceName (picks up static files)"
    Restart-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 4
    Get-Service -Name $ServiceName | Format-List Name, Status
  } else {
    Write-Host "Service $ServiceName not found - start uvicorn manually." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Open site:  https://mg-group.by/  (or http://91.149.133.54/)" -ForegroundColor Green
Write-Host "Cabinet:    https://mg-group.by/cabinet/" -ForegroundColor Green
Write-Host "API must be same host: /api/v1/... not http://IP/..." -ForegroundColor Green
Write-Host "Done."
