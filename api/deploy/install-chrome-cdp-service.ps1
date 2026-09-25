# Install HEADED Chrome CDP that stays up when you disconnect AnyDesk.
#
# How it survives disconnect:
#   1) Autologon keeps a Windows user session after reboot
#   2) Scheduled task starts Chrome at logon (interactive desktop)
#   3) You only DISCONNECT AnyDesk - never Log off
#   4) Watchdog restarts Chrome if it crashes
#
# Usage (Admin, while logged in as the AnyDesk user):
#   powershell -ExecutionPolicy Bypass -File api\deploy\install-chrome-cdp-service.ps1 -AppDir C:\mg-api

param(
  [string]$AppDir = "C:\mg-api",
  [string]$ServiceName = "mg-chrome-cdp",
  [int]$Port = 9223,
  [int]$Headless = 0
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run as Administrator."
  }
}

function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
  $lines = @()
  if (Test-Path $Path) { $lines = Get-Content $Path }
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
      $found = $true
      "$Key=$Value"
    } else { $line }
  }
  if (-not $found) { $out = @($out) + "$Key=$Value" }
  $out | Set-Content -Path $Path -Encoding UTF8
}

function Install-Nssm([string]$DestDir) {
  $nssmExe = Join-Path $DestDir "nssm.exe"
  if (Test-Path $nssmExe) { return $nssmExe }
  if (Get-Command nssm -ErrorAction SilentlyContinue) {
    return (Get-Command nssm).Source
  }
  $zip = Join-Path $env:TEMP "nssm-2.24.zip"
  $extract = Join-Path $env:TEMP "nssm-extract"
  Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip -UseBasicParsing
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extract -Force
  $src = Get-ChildItem -Path $extract -Recurse -Filter "nssm.exe" |
    Where-Object { $_.FullName -match '\\win64\\nssm\.exe$' } |
    Select-Object -First 1
  if (-not $src) { throw "nssm.exe not found" }
  New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
  Copy-Item $src.FullName $nssmExe -Force
  return $nssmExe
}

Assert-Admin

$apiDir = Join-Path $AppDir "api"
$deployDir = Join-Path $apiDir "deploy"
$watchdog = Join-Path $apiDir "scripts\chrome-cdp-watchdog.ps1"
$profileDir = Join-Path $apiDir "data\chrome-profile"
$dataDir = Join-Path $apiDir "data"
$envFile = Join-Path $apiDir ".env"
$taskName = "MG-Chrome-CDP"

if (-not (Test-Path $watchdog)) {
  throw "Missing $watchdog - pull latest repo first."
}
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# API must attach to headed Chrome
if (Test-Path $envFile) {
  Set-EnvValue $envFile "SCRAPER_CDP_URL" "http://127.0.0.1:$Port"
  Set-EnvValue $envFile "SCRAPER_CDP_HEADLESS" "false"
  Set-EnvValue $envFile "SCRAPER_CDP_AUTOSTART" "true"
  Set-EnvValue $envFile "SCRAPER_CDP_FALLBACK_LAUNCH" "false"
}

# Keep Terminal/AnyDesk session after disconnect (no forced logoff)
try {
  $tp = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services"
  if (-not (Test-Path $tp)) { New-Item -Path $tp -Force | Out-Null }
  New-ItemProperty -Path $tp -Name "MaxDisconnectionTime" -Value 0 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $tp -Name "MaxIdleTime" -Value 0 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $tp -Name "fResetBroken" -Value 0 -PropertyType DWord -Force | Out-Null
} catch {
  Write-Host "Session policy not set: $_" -ForegroundColor Yellow
}

$psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$taskArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$watchdog`" -Port $Port -ProfileDir `"$profileDir`" -Headless $Headless"

# 1) Scheduled task at USER logon (interactive desktop - visible Chrome)
Write-Host "==> Scheduled task $taskName (at logon, headed Chrome)"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $psExe -Argument $taskArgs -WorkingDirectory $apiDir
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerLogon, $triggerStartup) `
  -Settings $settings -Principal $principal -Force | Out-Null

# Start now in this session
Write-Host "==> starting watchdog now"
Start-Process -FilePath $psExe -ArgumentList $taskArgs -WorkingDirectory $apiDir -WindowStyle Minimized

# 2) NSSM backup watchdog (same headed flags) - restarts if task dies
$nssmExe = Install-Nssm $deployDir
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  & $nssmExe stop $ServiceName 2>$null
  Start-Sleep -Seconds 1
  & $nssmExe remove $ServiceName confirm
}
& $nssmExe install $ServiceName $psExe
& $nssmExe set $ServiceName AppParameters $taskArgs
& $nssmExe set $ServiceName AppDirectory $apiDir
& $nssmExe set $ServiceName DisplayName "MG.GROUP Chrome CDP (headed)"
& $nssmExe set $ServiceName Description "Visible Google Chrome with remote debugging. Restart on crash. Use with Autologon + AnyDesk disconnect (not logoff)."
& $nssmExe set $ServiceName Start SERVICE_AUTO_START
& $nssmExe set $ServiceName AppStdout (Join-Path $dataDir "chrome-cdp-out.log")
& $nssmExe set $ServiceName AppStderr (Join-Path $dataDir "chrome-cdp-err.log")
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppExit Default Restart
& $nssmExe set $ServiceName AppRestartDelay 5000
# Run as current user so Chrome can attach to interactive desktop when logged on
try {
  & $nssmExe set $ServiceName ObjectName ".\$env:USERNAME" 2>$null
} catch {}
# Do not auto-start NSSM now if task already launched Chrome (same port)
Write-Host "NSSM service installed (manual start if needed): $ServiceName"

Start-Sleep -Seconds 6
$cdpOk = $false
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 5
  $cdpOk = $true
  Write-Host $r.Content
} catch {
  Write-Host "CDP not ready yet - wait for Chrome window" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " HEADED Chrome CDP ready"
Write-Host " Port:     $Port"
Write-Host " Profile:  $profileDir"
Write-Host " Task:     $taskName"
Write-Host " CDP:      $(if ($cdpOk) { 'OK' } else { 'starting...' })"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Yellow
Write-Host " 1) Enable Autologon for this Windows user (autologon.exe from Microsoft Sysinternals)"
Write-Host " 2) In AnyDesk: Disconnect - do NOT Log off / Sign out"
Write-Host " 3) Log into Copart/IAAI/Bid.cars once in the opened Chrome window"
Write-Host " 4) Restart-Service mg-api"
Write-Host " 5) api\.env: SCRAPER_CDP_HEADLESS=false"
Write-Host ""
