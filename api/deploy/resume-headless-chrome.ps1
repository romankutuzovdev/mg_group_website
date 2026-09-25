# After manual auction logins, restore headless Chrome CDP service.
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\resume-headless-chrome.ps1

param(
  [string]$AppDir = "C:\mg-api",
  [int]$Port = 9223
)

$ErrorActionPreference = "Stop"

$apiDir = Join-Path $AppDir "api"
$profileDir = Join-Path $apiDir "data\chrome-profile"
$chromeSvc = "mg-chrome-cdp"
$install = Join-Path $apiDir "deploy\install-chrome-cdp-service.ps1"

Write-Host "==> stop headed Chrome on profile/port"
Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match [regex]::Escape($profileDir) -or $_.CommandLine -match "remote-debugging-port=$Port" } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
Start-Sleep -Seconds 2

if (Test-Path $install) {
  Write-Host "==> install/start headless mg-chrome-cdp"
  powershell -ExecutionPolicy Bypass -File $install -AppDir $AppDir -Port $Port
} else {
  throw "Missing $install"
}

Write-Host "==> restart mg-api"
Restart-Service -Name "mg-api" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

Write-Host "CDP check:"
try {
  $v = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 5
  Write-Host $v.Content
} catch {
  Write-Host "CDP not ready yet: $_" -ForegroundColor Yellow
}

Write-Host "Scraper status: http://127.0.0.1/api/v1/scraper/status"
Write-Host "Done."
