# Open headed Chrome with the scraper profile so you can log into auctions.
# Cookies stay in api\data\chrome-profile and scrapers reuse them.
#
# Usage (on Windows Server, AnyDesk connected):
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\login-auctions-chrome.ps1
#
# Then log into Copart / IAAI / Manheim / Copart UK in the opened tabs.
# When done, either leave this Chrome running OR run resume-headless-chrome.ps1
# and restart mg-api.

param(
  [string]$AppDir = "C:\mg-api",
  [int]$Port = 9223
)

$ErrorActionPreference = "Stop"

$apiDir = Join-Path $AppDir "api"
$profileDir = Join-Path $apiDir "data\chrome-profile"
$chromeSvc = "mg-chrome-cdp"

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$chrome = @(
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $chrome) { throw "Google Chrome not found" }

Write-Host "==> stop headless service (if any)"
$svc = Get-Service -Name $chromeSvc -ErrorAction SilentlyContinue
if ($svc) {
  try { Stop-Service -Name $chromeSvc -Force -ErrorAction SilentlyContinue } catch {}
}

# Kill leftover chrome on this profile / debug port
Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match [regex]::Escape($profileDir) -or $_.CommandLine -match "remote-debugging-port=$Port" } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
Start-Sleep -Seconds 2

Write-Host "==> start HEADED Chrome CDP on port $Port"
Write-Host "    Profile: $profileDir"
$urls = @(
  "https://www.copart.com/",
  "https://www.iaai.com/",
  "https://www.manheim.com/",
  "https://www.copart.co.uk/"
)
$argList = @(
  "--remote-debugging-port=$Port",
  "--remote-allow-origins=*",
  "--user-data-dir=$profileDir",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-dev-shm-usage"
) + $urls

Start-Process -FilePath $chrome -ArgumentList $argList

Write-Host ""
Write-Host "Log into each auction site in the opened Chrome windows." -ForegroundColor Green
Write-Host "Keep this Chrome open while scrapers run, OR after login:" -ForegroundColor Yellow
Write-Host "  1) Close Chrome"
Write-Host "  2) powershell -ExecutionPolicy Bypass -File $(Join-Path $apiDir 'deploy\resume-headless-chrome.ps1')"
Write-Host "  3) Restart-Service mg-api"
Write-Host ""
Write-Host "In api\.env keep: SCRAPER_CDP_URL=http://127.0.0.1:$Port"
Write-Host "Optional while headed Chrome is open: SCRAPER_CDP_HEADLESS=false"
