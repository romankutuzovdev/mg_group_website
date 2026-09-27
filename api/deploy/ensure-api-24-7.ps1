# Keep mg-api + scrapers up 24/7 on Windows Server.
# - NSSM: auto-restart uvicorn on crash
# - Scheduled task every 2 min: health check → Start-Service → POST /scraper/start
# - Ensures Chrome CDP keepalive task exists (calls ensure-chrome-24-7 if missing)
#
# Run once as Administrator (interactive / AnyDesk user):
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\ensure-api-24-7.ps1

param(
  [string]$AppDir = "C:\mg-api",
  [string]$ServiceName = "mg-api",
  [int]$ApiPort = 0
)

$ErrorActionPreference = "Continue"
$apiDir = Join-Path $AppDir "api"
$deployDir = Join-Path $apiDir "deploy"
$dataDir = Join-Path $apiDir "data"
$nssm = Join-Path $deployDir "nssm.exe"
$psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$taskKeep = "MG-API-Keepalive"
$behindCaddy = Join-Path $deployDir ".behind-caddy"

if (-not (Test-Path $apiDir)) {
  throw "Missing $apiDir — clone repo to $AppDir first"
}

# Resolve API port (Caddy → loopback 8080)
if ($ApiPort -le 0) {
  if (Test-Path $behindCaddy) { $ApiPort = 8080 } else { $ApiPort = 80 }
}
$healthUrl = "http://127.0.0.1:$ApiPort/health"
$scraperStatusUrl = "http://127.0.0.1:$ApiPort/api/v1/scraper/status"
$scraperStartUrl = "http://127.0.0.1:$ApiPort/api/v1/scraper/start"

function Test-ApiHealthy {
  try {
    $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 8
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300)
  } catch { return $false }
}

# --- NSSM: crash recovery for mg-api ---
if (Test-Path $nssm) {
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc) {
    Write-Host "==> NSSM AppExit restart for $ServiceName"
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & $nssm set $ServiceName AppExit Default Restart 2>&1 | Out-Null
    & $nssm set $ServiceName AppRestartDelay 3000 2>&1 | Out-Null
    & $nssm set $ServiceName AppThrottle 2000 2>&1 | Out-Null
    & $nssm set $ServiceName Start SERVICE_AUTO_START 2>&1 | Out-Null
    # Recovery: restart service on failure (Windows SCM)
    try {
      sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
      sc.exe failureflag $ServiceName 1 | Out-Null
    } catch {}
    $ErrorActionPreference = $prev

    if ($svc.Status -ne "Running") {
      Write-Host "==> starting $ServiceName (was $($svc.Status))"
      try { Start-Service $ServiceName -ErrorAction Stop } catch { Write-Host $_ }
      Start-Sleep -Seconds 5
    }
  } else {
    Write-Host "Service $ServiceName not found — run setup-windows.ps1 first" -ForegroundColor Yellow
  }
} else {
  Write-Host "nssm.exe missing at $nssm — skip NSSM tweak" -ForegroundColor Yellow
}

# --- Chrome 24/7 (if not already registered) ---
$chromeKeep = Get-ScheduledTask -TaskName "MG-Chrome-CDP-Keepalive" -ErrorAction SilentlyContinue
$chromeEnsure = Join-Path $deployDir "ensure-chrome-24-7.ps1"
if (-not $chromeKeep -and (Test-Path $chromeEnsure)) {
  Write-Host "==> Chrome keepalive missing — running ensure-chrome-24-7.ps1"
  try {
    & $psExe -NoProfile -ExecutionPolicy Bypass -File $chromeEnsure -AppDir $AppDir
  } catch {
    Write-Host "  chrome ensure: $_" -ForegroundColor Yellow
  }
}

# --- Keepalive tick script ---
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$keepScript = Join-Path $deployDir "_api-keepalive-tick.ps1"
$keepBody = @"
`$ErrorActionPreference = 'Continue'
`$log = Join-Path '$dataDir' 'api-keepalive.log'
`$port = $ApiPort
`$svcName = '$ServiceName'
`$health = "http://127.0.0.1:`$port/health"
`$statusUrl = "http://127.0.0.1:`$port/api/v1/scraper/status"
`$startUrl = "http://127.0.0.1:`$port/api/v1/scraper/start"
`$cdpPort = 9223
function Log([string]`$m) {
  `$line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), `$m
  try { Add-Content -Path `$log -Value `$line -Encoding UTF8 } catch {}
}
function Ok-Http([string]`$url) {
  try {
    `$r = Invoke-WebRequest -Uri `$url -UseBasicParsing -TimeoutSec 8
    return (`$r.StatusCode -ge 200 -and `$r.StatusCode -lt 300)
  } catch { return `$false }
}
function Ok-Cdp {
  try {
    `$r = Invoke-WebRequest "http://127.0.0.1:`$cdpPort/json/version" -UseBasicParsing -TimeoutSec 2
    return (`$r.StatusCode -ge 200)
  } catch { return `$false }
}

# 1) API service
`$svc = Get-Service -Name `$svcName -EA SilentlyContinue
if (`$svc -and `$svc.Status -ne 'Running') {
  Log "starting service `$svcName (was `$(`$svc.Status))"
  try { Start-Service `$svcName } catch { Log "Start-Service failed: `$_" }
  Start-Sleep -Seconds 8
}

# 2) Health
if (-not (Ok-Http `$health)) {
  Log "health FAIL — Restart-Service `$svcName"
  try { Restart-Service `$svcName -Force } catch { Log "Restart-Service failed: `$_" }
  Start-Sleep -Seconds 10
  if (-not (Ok-Http `$health)) { Log "health still FAIL after restart"; exit 0 }
  Log "health OK after restart"
}

# 3) Chrome CDP (trigger existing chrome keepalive task if CDP down)
if (-not (Ok-Cdp)) {
  Log "Chrome window is not open — asking the desktop task to open Copart"
  try { Start-ScheduledTask -TaskName 'MG-Chrome-CDP-Keepalive' -EA SilentlyContinue } catch {}
  try { Start-ScheduledTask -TaskName 'MG-Chrome-CDP' -EA SilentlyContinue } catch {}
}

# 4) Scrapers must be running
try {
  `$st = Invoke-RestMethod -Uri `$statusUrl -TimeoutSec 15
  if (-not `$st.running) {
    Log "scraper not running — POST /scraper/start"
    try { Invoke-RestMethod -Method Post -Uri `$startUrl -TimeoutSec 30 | Out-Null } catch { Log "scraper start: `$_" }
  }
} catch {
  Log "scraper status: `$_"
}
"@
Set-Content -Path $keepScript -Value $keepBody -Encoding UTF8

Write-Host "==> scheduled task $taskKeep (every 2 min)"
Unregister-ScheduledTask -TaskName $taskKeep -Confirm:$false -ErrorAction SilentlyContinue
$keepAction = New-ScheduledTaskAction -Execute $psExe `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$keepScript`"" `
  -WorkingDirectory $apiDir
$keepTrig = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 2) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$keepSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
# SYSTEM can restart services; scrapers/CDP still need interactive Chrome user session
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskKeep -Action $keepAction -Trigger $keepTrig `
  -Settings $keepSettings -Principal $principal -Force | Out-Null

# Also at startup
$taskBoot = "MG-API-Keepalive-Boot"
Unregister-ScheduledTask -TaskName $taskBoot -Confirm:$false -ErrorAction SilentlyContinue
$bootTrig = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName $taskBoot -Action $keepAction -Trigger $bootTrig `
  -Settings $keepSettings -Principal $principal -Force | Out-Null

Write-Host "==> run keepalive once now"
& $psExe -NoProfile -ExecutionPolicy Bypass -File $keepScript

Start-Sleep -Seconds 3
if (Test-ApiHealthy) {
  Write-Host "Health OK: $healthUrl" -ForegroundColor Green
} else {
  Write-Host "Health still failing: $healthUrl" -ForegroundColor Red
}

try {
  $s = Invoke-RestMethod $scraperStatusUrl -TimeoutSec 15
  Write-Host ("scraper running={0} lots={1} mode={2}" -f $s.running, $s.lots_in_store, $s.browser_mode)
} catch {
  Write-Host "scraper status: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "24/7 API: NSSM AppExit + tasks $taskKeep / $taskBoot" -ForegroundColor Green
Write-Host "Log: $dataDir\api-keepalive.log"
Write-Host "If Copart/IAAI show last_blocked=incapsula — log into auctions in headed Chrome once."
