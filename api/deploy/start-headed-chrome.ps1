# Start visible Chrome CDP in THIS AnyDesk/desktop session (not Session 0 / NSSM).
# Run as the logged-on user (Admin OK). Do not Log off - only Disconnect AnyDesk.
#
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\start-headed-chrome.ps1

param(
  [string]$AppDir = "C:\mg-api",
  [int]$Port = 9223,
  [switch]$SkipApiRestart
)

$ErrorActionPreference = "Continue"
$apiDir = Join-Path $AppDir "api"
$watchdog = Join-Path $apiDir "scripts\chrome-cdp-watchdog.ps1"
$profileDir = Join-Path $apiDir "data\chrome-profile"
$psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path $watchdog)) {
  throw "Missing $watchdog - git pull first"
}

Write-Host "==> stop Session-0 NSSM Chrome (invisible / fights the port)"
foreach ($svcName in @("mg-chrome-cdp")) {
  try { Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue } catch {}
  $nssm = Join-Path $apiDir "deploy\nssm.exe"
  if (Test-Path $nssm) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & $nssm stop $svcName 2>&1 | Out-Null
    & $nssm set $svcName Start SERVICE_DISABLED 2>&1 | Out-Null
    $ErrorActionPreference = $prev
  }
}

Write-Host "==> free port $Port"
try {
  $lines = netstat -ano | Select-String ":$Port "
  foreach ($line in $lines) {
    if ($line -notmatch "LISTENING") { continue }
    $parts = ($line.ToString() -split "\s+") | Where-Object { $_ -ne "" }
    $procId = $parts[-1]
    if ($procId -and $procId -notmatch '^(0|4)$') {
      & taskkill /F /PID $procId 2>$null | Out-Null
    }
  }
} catch {}

# Drop stale profile locks (Chrome left after crash)
foreach ($lockName in @("SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile")) {
  $p = Join-Path $profileDir $lockName
  if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
}

Write-Host "==> start headed watchdog in interactive session"
$watchdogArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$watchdog`" -Port $Port -ProfileDir `"$profileDir`" -Headless 0"
Start-Process -FilePath $psExe -ArgumentList $watchdogArgs -WorkingDirectory $apiDir -WindowStyle Minimized

$ok = $false
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -ge 200) {
      $ok = $true
      Write-Host "CDP OK: $($r.Content.Substring(0, [Math]::Min(180, $r.Content.Length)))"
      break
    }
  } catch {}
}

if (-not $ok) {
  Write-Host "CDP still down. Check: Google Chrome installed? Profile locked?" -ForegroundColor Red
  Write-Host "  Test-Path 'C:\Program Files\Google\Chrome\Application\chrome.exe'"
  exit 1
}

if (-not $SkipApiRestart) {
  Write-Host "==> restart mg-api so scrapers attach"
  try { Restart-Service -Name mg-api -Force -ErrorAction Stop } catch {
    Write-Host "Restart-Service mg-api failed: $_" -ForegroundColor Yellow
  }

  Start-Sleep -Seconds 6
  Write-Host "==> scraper status"
  try {
    $st = Invoke-WebRequest -Uri "http://127.0.0.1/api/v1/scraper/status" -UseBasicParsing -TimeoutSec 20
    Write-Host $st.Content.Substring(0, [Math]::Min(600, $st.Content.Length))
  } catch {
    Write-Host "scraper status: $_" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Chrome window should be visible NOW. Log into Copart/IAAI there." -ForegroundColor Green
Write-Host "AnyDesk: Disconnect only - never Log off."
