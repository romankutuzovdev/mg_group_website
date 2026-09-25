# Keep YOUR Google Chrome + CDP up 24/7 (interactive desktop / AnyDesk session).
# - Starts chrome-cdp-watchdog if missing
# - Watchdog restarts Chrome when you close it or it crashes
# - Scheduled tasks: at logon + every 2 minutes
#
# Run once as the AnyDesk user (Admin):
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\ensure-chrome-24-7.ps1

param(
  [string]$AppDir = "C:\mg-api",
  [int]$Port = 9223
)

$ErrorActionPreference = "Continue"
$apiDir = Join-Path $AppDir "api"
$watchdog = Join-Path $apiDir "scripts\chrome-cdp-watchdog.ps1"
$psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$taskWatch = "MG-Chrome-CDP"
$taskKeep = "MG-Chrome-CDP-Keepalive"
$profileDir = if ($env:SCRAPER_CHROME_USER_DATA) {
  $env:SCRAPER_CHROME_USER_DATA
} else {
  Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
}

if (-not (Test-Path $watchdog)) {
  throw "Missing $watchdog - git pull first"
}

# Patch .env for headed + real profile
$envFile = Join-Path $apiDir ".env"
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
if (Test-Path $envFile) {
  Set-EnvValue $envFile "SCRAPER_CDP_URL" "http://127.0.0.1:$Port"
  Set-EnvValue $envFile "SCRAPER_CDP_HEADLESS" "false"
  Set-EnvValue $envFile "SCRAPER_CDP_AUTOSTART" "true"
  Set-EnvValue $envFile "SCRAPER_AUTOSTART" "true"
  Set-EnvValue $envFile "SCRAPER_CDP_FALLBACK_LAUNCH" "false"
  Set-EnvValue $envFile "SCRAPER_CHROME_USER_DATA" $profileDir
}

# Kill Session-0 NSSM chrome (invisible)
try { Stop-Service mg-chrome-cdp -Force -ErrorAction SilentlyContinue } catch {}
$nssm = Join-Path $apiDir "deploy\nssm.exe"
if (Test-Path $nssm) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  & $nssm stop mg-chrome-cdp 2>&1 | Out-Null
  & $nssm set mg-chrome-cdp Start SERVICE_DISABLED 2>&1 | Out-Null
  $ErrorActionPreference = $prev
}

$watchArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$watchdog`" -Port $Port -ProfileDir `"$profileDir`" -Headless 0 -CheckSeconds 3"

function Test-Cdp {
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -ge 200)
  } catch { return $false }
}

function Test-WatchdogRunning {
  $procs = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if ($p.CommandLine -and $p.CommandLine -match 'chrome-cdp-watchdog\.ps1') { return $true }
  }
  return $false
}

function Start-WatchdogNow {
  Write-Host "==> starting chrome-cdp-watchdog"
  Start-Process -FilePath $psExe -ArgumentList $watchArgs -WorkingDirectory $apiDir -WindowStyle Minimized
}

# Register logon watchdog (restarts if task process dies)
Write-Host "==> scheduled task $taskWatch (logon + restart on failure)"
Unregister-ScheduledTask -TaskName $taskWatch -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $psExe -Argument $watchArgs -WorkingDirectory $apiDir
$trigLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskWatch -Action $action -Trigger $trigLogon `
  -Settings $settings -Principal $principal -Force | Out-Null

# Keepalive every 2 minutes: if watchdog/CDP dead -> start again
$keepScript = Join-Path $apiDir "deploy\_chrome-keepalive-tick.ps1"
$keepBody = @"
`$ErrorActionPreference = 'Continue'
`$port = $Port
`$app = '$AppDir'
`$api = Join-Path `$app 'api'
`$wd = Join-Path `$api 'scripts\chrome-cdp-watchdog.ps1'
`$ps = "`$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
`$profile = '$profileDir'
function Ok-Cdp {
  try {
    `$r = Invoke-WebRequest "http://127.0.0.1:`$port/json/version" -UseBasicParsing -TimeoutSec 2
    return (`$r.StatusCode -ge 200)
  } catch { return `$false }
}
`$wdLive = `$false
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -EA SilentlyContinue | ForEach-Object {
  if (`$_.CommandLine -match 'chrome-cdp-watchdog\.ps1') { `$script:wdLive = `$true }
}
if (-not `$wdLive -or -not (Ok-Cdp)) {
  if (-not `$wdLive) {
    Start-Process `$ps -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File ``"`$wd``" -Port `$port -ProfileDir ``"`$profile``" -Headless 0 -CheckSeconds 3" -WorkingDirectory `$api -WindowStyle Minimized
  }
}
"@
Set-Content -Path $keepScript -Value $keepBody -Encoding UTF8

Write-Host "==> scheduled task $taskKeep (every 2 min)"
Unregister-ScheduledTask -TaskName $taskKeep -Confirm:$false -ErrorAction SilentlyContinue
$keepAction = New-ScheduledTaskAction -Execute $psExe -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$keepScript`"" -WorkingDirectory $apiDir
$keepTrig = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
$keepSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskKeep -Action $keepAction -Trigger $keepTrig `
  -Settings $keepSettings -Principal $principal -Force | Out-Null

if (-not (Test-WatchdogRunning)) {
  Start-WatchdogNow
} else {
  Write-Host "==> watchdog already running"
}

$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  if (Test-Cdp) { $ok = $true; break }
}
if ($ok) {
  Write-Host "CDP OK on :$Port" -ForegroundColor Green
} else {
  Write-Host "CDP not ready yet - check Chrome window" -ForegroundColor Yellow
}

Write-Host "==> restart mg-api + start scrapers"
try { Restart-Service mg-api -Force } catch { Write-Host $_ }
Start-Sleep -Seconds 10
try {
  Invoke-RestMethod -Method Post "http://127.0.0.1/api/v1/scraper/start" | Out-Null
} catch {}
Start-Sleep -Seconds 5
try {
  $s = Invoke-RestMethod "http://127.0.0.1/api/v1/scraper/status"
  Write-Host ("running={0} browser_mode={1} lots={2} cycles={3}" -f $s.running, $s.browser_mode, $s.lots_in_store, $s.cycles)
} catch {
  Write-Host "scraper status: $_"
}

Write-Host ""
Write-Host "24/7 Chrome: task $taskWatch + keepalive $taskKeep" -ForegroundColor Green
Write-Host "If Chrome closes, watchdog opens it again within ~3s."
Write-Host "AnyDesk: Disconnect only. Enable Autologon for reboot survival."
Write-Host "Log into Copart/IAAI/Manheim in the Chrome window once."
