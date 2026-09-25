# Watchdog: keep HEADED Google Chrome with CDP alive.
# Must run in an interactive Windows user session (not Session 0 headless).
# Survives AnyDesk disconnect if you DISCONNECT (do not Log off) and Autologon is on.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File chrome-cdp-watchdog.ps1 -Port 9223
#   powershell ... -Headless 0   (default - visible Chrome)

param(
  [int]$Port = 9223,
  [string]$ProfileDir = "",
  [int]$CheckSeconds = 5,
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

function Start-ChromeCdp([string]$ChromeExe, [int]$Port, [string]$Profile, [bool]$IsHeadless) {
  New-Item -ItemType Directory -Force -Path $Profile | Out-Null
  Clear-ProfileLocks $Profile
  $args = [System.Collections.Generic.List[string]]::new()
  if ($IsHeadless) {
    $args.Add("--headless=new")
    $args.Add("--disable-gpu")
    $args.Add("--window-size=1920,1080")
    $args.Add("--no-sandbox")
  } else {
    $args.Add("--start-maximized")
    $args.Add("--window-size=1600,1000")
  }
  $args.Add("--remote-debugging-port=$Port")
  $args.Add("--remote-allow-origins=*")
  $args.Add("--user-data-dir=$Profile")
  $args.Add("--no-first-run")
  $args.Add("--no-default-browser-check")
  $args.Add("--disable-dev-shm-usage")
  # Keep networking so chrome://extensions / updates can work
  $args.Add("--disable-features=Translate,BackForwardCache")
  $args.Add("--enable-extensions")
  $args.Add("--disable-extensions-file-access-check")
  # Allow developer mode / unpacked (Web Store "Add" is often blocked under CDP)
  $args.Add("--allow-legacy-extension-manifests")

  # Unpacked extensions from api\data\chrome-extensions\<name>\manifest.json
  $extRoot = Join-Path (Split-Path $Profile -Parent) "chrome-extensions"
  if (Test-Path $extRoot) {
    $dirs = Get-ChildItem -Path $extRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
      ForEach-Object { $_.FullName }
    if ($dirs -and $dirs.Count -gt 0) {
      $joined = [string]::Join(",", $dirs)
      $args.Add("--load-extension=$joined")
      Write-Host "  load-extension: $joined"
    }
  }

  # Force-enable extensions already installed in the profile
  $prefs = Join-Path $Profile "Default\Preferences"
  if (Test-Path $prefs) {
    try {
      $json = Get-Content -Raw -Path $prefs -Encoding UTF8 | ConvertFrom-Json
      $changed = $false
      if ($json.extensions -and $json.extensions.settings) {
        foreach ($prop in $json.extensions.settings.PSObject.Properties) {
          $meta = $prop.Value
          if (-not $meta) { continue }
          if ($meta.state -ne 1) { $meta.state = 1; $changed = $true }
          if ($meta.disable_reasons) { $meta.disable_reasons = 0; $changed = $true }
        }
      }
      if ($json.extensions) {
        if (-not $json.extensions.ui) {
          $json.extensions | Add-Member -NotePropertyName ui -NotePropertyValue ([pscustomobject]@{ developer_mode = $true }) -Force
          $changed = $true
        } elseif (-not $json.extensions.ui.developer_mode) {
          $json.extensions.ui.developer_mode = $true
          $changed = $true
        }
      }
      if ($changed) {
        $json | ConvertTo-Json -Depth 100 -Compress | Set-Content -Path $prefs -Encoding UTF8
        Write-Host "  extensions re-enabled in Preferences"
      }
    } catch {
      Write-Host "  prefs patch skipped: $_"
    }
  }

  $args.Add("about:blank")

  if ($IsHeadless) {
    Start-Process -FilePath $ChromeExe -ArgumentList $args -WindowStyle Hidden | Out-Null
  } else {
    # Visible Chrome in the current user desktop (AnyDesk session)
    Start-Process -FilePath $ChromeExe -ArgumentList $args -WindowStyle Normal | Out-Null
  }
}

if (-not $ProfileDir) {
  $ProfileDir = Join-Path $PSScriptRoot "..\data\chrome-profile"
}
$ProfileDir = [System.IO.Path]::GetFullPath($ProfileDir)
$IsHeadless = ($Headless -ne 0)

$chrome = Find-Chrome
if (-not $chrome) {
  Write-Error "Google Chrome not found"
  exit 1
}

$mode = if ($IsHeadless) { "headless" } else { "HEADED (visible)" }
Write-Host "mg-chrome-cdp watchdog: mode=$mode port=$Port profile=$ProfileDir"
Write-Host "Disconnect AnyDesk only - do NOT Log off Windows."

while ($true) {
  if (-not (Test-Cdp $Port)) {
    Write-Host "$(Get-Date -Format o) CDP down - restarting $mode Chrome"
    Stop-PortListeners $Port
    Start-Sleep -Seconds 1
    try {
      Start-ChromeCdp -ChromeExe $chrome -Port $Port -Profile $ProfileDir -IsHeadless $IsHeadless
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
