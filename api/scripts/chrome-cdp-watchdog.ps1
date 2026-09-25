# Watchdog: keep headless Chrome CDP alive outside AnyDesk / RDP sessions.
# Installed as Windows service `mg-chrome-cdp` (NSSM) - Session 0 / LOCAL SYSTEM.
# Do NOT run interactive (visible) Chrome for scrapers if you disconnect remote desktop.

param(
  [int]$Port = 9223,
  [string]$ProfileDir = "",
  [int]$CheckSeconds = 8
)

$ErrorActionPreference = "Continue"

function Find-Chrome {
  $candidates = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

function Test-Cdp([int]$Port) {
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 2
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Clear-ProfileLocks([string]$Dir) {
  foreach ($name in @("SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile")) {
    $p = Join-Path $Dir $name
    if (Test-Path $p) {
      try { Remove-Item $p -Force -ErrorAction SilentlyContinue } catch {}
    }
  }
}

function Stop-PortListeners([int]$Port) {
  try {
    $lines = netstat -ano | Select-String ":$Port "
    foreach ($line in $lines) {
      if ($line -notmatch "LISTENING") { continue }
      $parts = ($line.ToString() -split "\s+") | Where-Object { $_ -ne "" }
      $procId = $parts[-1]
      if ($procId -and $procId -notmatch "^(0|4)$") {
        & taskkill /F /PID $procId 2>$null | Out-Null
      }
    }
  } catch {}
}

function Start-HeadlessChrome([string]$ChromeExe, [int]$Port, [string]$Profile) {
  New-Item -ItemType Directory -Force -Path $Profile | Out-Null
  Clear-ProfileLocks $Profile
  $args = @(
    "--headless=new",
    "--disable-gpu",
    "--window-size=1920,1080",
    "--no-sandbox",
    "--remote-debugging-port=$Port",
    "--remote-allow-origins=*",
    "--user-data-dir=$Profile",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-features=Translate,BackForwardCache",
    "about:blank"
  )
  # Detached from any interactive desktop / AnyDesk session
  Start-Process -FilePath $ChromeExe -ArgumentList $args -WindowStyle Hidden | Out-Null
}

if (-not $ProfileDir) {
  $ProfileDir = Join-Path $PSScriptRoot "..\data\chrome-profile"
}
$ProfileDir = [System.IO.Path]::GetFullPath($ProfileDir)

$chrome = Find-Chrome
if (-not $chrome) {
  Write-Error "Google Chrome not found"
  exit 1
}

Write-Host "mg-chrome-cdp watchdog: port=$Port profile=$ProfileDir chrome=$chrome"

while ($true) {
  if (-not (Test-Cdp $Port)) {
    Write-Host "$(Get-Date -Format o) CDP down - restarting headless Chrome"
    Stop-PortListeners $Port
    Start-Sleep -Seconds 1
    try {
      Start-HeadlessChrome -ChromeExe $chrome -Port $Port -Profile $ProfileDir
    } catch {
      Write-Host "  start failed: $_"
    }
    # wait up to ~30s for CDP
    for ($i = 0; $i -lt 15; $i++) {
      Start-Sleep -Seconds 2
      if (Test-Cdp $Port) {
        Write-Host "$(Get-Date -Format o) CDP ready on :$Port"
        break
      }
    }
  }
  Start-Sleep -Seconds $CheckSeconds
}
