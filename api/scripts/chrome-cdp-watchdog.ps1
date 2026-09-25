# Watchdog: keep the USER's real Google Chrome alive with CDP.
# Uses default profile: %LOCALAPPDATA%\Google\Chrome\User Data
# (extensions + Copart/IAAI logins stay in YOUR Chrome, not a separate profile).
#
# Must run in an interactive Windows user session (not Session 0).
# Close other Chrome windows first - one profile cannot be shared by two Chromes.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File chrome-cdp-watchdog.ps1 -Port 9223
#   powershell ... -Headless 0

param(
  [int]$Port = 9223,
  [string]$ProfileDir = "",
  [string]$ProfileName = "Default",
  [int]$CheckSeconds = 3,
  [int]$Headless = 0
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

function Get-DefaultChromeUserData {
  $p = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
  return $p
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

function Stop-ChromeUsingProfile([string]$Profile) {
  # Real User Data cannot be opened twice - close existing Chrome first
  $norm = $Profile.TrimEnd('\', '/').ToLowerInvariant()
  Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
      if (-not $cmd) {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        return
      }
      $cmdLow = $cmd.ToLowerInvariant()
      if ($cmdLow -match [regex]::Escape($norm) -or $cmdLow -notmatch 'user-data-dir=') {
        # No user-data-dir => default profile; or matches our profile
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
      }
    } catch {
      try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
  }
  Start-Sleep -Seconds 2
  Clear-ProfileLocks $Profile
}

function Start-ChromeCdp(
  [string]$ChromeExe,
  [int]$Port,
  [string]$Profile,
  [string]$ProfileName,
  [bool]$IsHeadless,
  [string]$ExtraExtRoot
) {
  if (-not (Test-Path $Profile)) {
    New-Item -ItemType Directory -Force -Path $Profile | Out-Null
  }
  Stop-ChromeUsingProfile $Profile

  $argList = [System.Collections.Generic.List[string]]::new()
  if ($IsHeadless) {
    $argList.Add("--headless=new")
    $argList.Add("--disable-gpu")
    $argList.Add("--window-size=1920,1080")
    $argList.Add("--no-sandbox")
  } else {
    $argList.Add("--start-maximized")
    $argList.Add("--window-size=1600,1000")
  }
  $argList.Add("--remote-debugging-port=$Port")
  $argList.Add("--remote-allow-origins=*")
  $argList.Add("--user-data-dir=$Profile")
  $argList.Add("--profile-directory=$ProfileName")
  $argList.Add("--no-first-run")
  $argList.Add("--no-default-browser-check")
  $argList.Add("--disable-dev-shm-usage")
  $argList.Add("--disable-features=Translate,BackForwardCache")
  $argList.Add("--enable-extensions")
  $argList.Add("--disable-extensions-file-access-check")

  # Optional extra unpacked addons (api\data\chrome-extensions) - your Web Store ones stay in the profile
  if ($ExtraExtRoot -and (Test-Path $ExtraExtRoot)) {
    $dirs = Get-ChildItem -Path $ExtraExtRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
      ForEach-Object { $_.FullName }
    if ($dirs -and $dirs.Count -gt 0) {
      $joined = [string]::Join(",", $dirs)
      $argList.Add("--load-extension=$joined")
      Write-Host "  load-extension: $joined"
    }
  }

  $argList.Add("about:blank")

  Write-Host "  launching YOUR Chrome profile: $Profile ($ProfileName)"
  if ($IsHeadless) {
    Start-Process -FilePath $ChromeExe -ArgumentList $argList -WindowStyle Hidden | Out-Null
  } else {
    Start-Process -FilePath $ChromeExe -ArgumentList $argList -WindowStyle Normal | Out-Null
  }
}

if (-not $ProfileDir) {
  if ($env:SCRAPER_CHROME_USER_DATA) {
    $ProfileDir = $env:SCRAPER_CHROME_USER_DATA
  } else {
    $ProfileDir = Get-DefaultChromeUserData
  }
}
if ($env:SCRAPER_CHROME_PROFILE_DIRECTORY) {
  $ProfileName = $env:SCRAPER_CHROME_PROFILE_DIRECTORY
}
$ProfileDir = [System.IO.Path]::GetFullPath($ProfileDir)
$IsHeadless = ($Headless -ne 0)
$extraExt = Join-Path $PSScriptRoot "..\data\chrome-extensions"
$extraExt = [System.IO.Path]::GetFullPath($extraExt)

$chrome = Find-Chrome
if (-not $chrome) {
  Write-Error "Google Chrome not found"
  exit 1
}

$mode = if ($IsHeadless) { "headless" } else { "HEADED (your Chrome)" }
Write-Host "mg-chrome-cdp watchdog: mode=$mode port=$Port"
Write-Host "  profile=$ProfileDir"
Write-Host "  directory=$ProfileName"
Write-Host "Close other Chrome windows - this is your real browser profile."
Write-Host "Disconnect AnyDesk only - do NOT Log off Windows."

while ($true) {
  if (-not (Test-Cdp $Port)) {
    Write-Host "$(Get-Date -Format o) CDP down - restarting $mode Chrome"
    Stop-PortListeners $Port
    Start-Sleep -Seconds 1
    try {
      Start-ChromeCdp -ChromeExe $chrome -Port $Port -Profile $ProfileDir -ProfileName $ProfileName -IsHeadless $IsHeadless -ExtraExtRoot $extraExt
    } catch {
      Write-Host "  start failed: $_"
    }
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 2
      if (Test-Cdp $Port) {
        Write-Host "$(Get-Date -Format o) CDP ready on :$Port"
        break
      }
    }
  }
  Start-Sleep -Seconds $CheckSeconds
}
