# Update MG.GROUP API on Windows Server from GitHub (CI or manual).
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\update-from-git.ps1
#
# Env:
#   APP_DIR, BRANCH, API_PORT, SERVICE_NAME
#   SKIP_WEBSITE=1  - skip Next.js rebuild (default in CI for faster API deploy)
#   SKIP_CHROME=1   - skip Chrome CDP ensure

$ErrorActionPreference = "Stop"

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
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

function Test-Cdp([int]$Port) {
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 3
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
  } catch {
    return $false
  }
}

$AppDir = if ($env:APP_DIR) { $env:APP_DIR } else { "C:\mg-api" }
$Branch = if ($env:BRANCH) { $env:BRANCH } else { "main" }
$Port = if ($env:API_PORT) { [int]$env:API_PORT } else { 80 }
$ServiceName = if ($env:SERVICE_NAME) { $env:SERVICE_NAME } else { "mg-api" }
$CdpPort = 9223
# CI: skip website by default (set SKIP_WEBSITE=0 to force build)
if (-not $env:SKIP_WEBSITE) { $env:SKIP_WEBSITE = "1" }

$apiDir = Join-Path $AppDir "api"
if (-not (Test-Path (Join-Path $AppDir ".git"))) {
  throw "No git repo in $AppDir. First: git clone <repo> $AppDir then api\deploy\install-windows.ps1"
}
if (-not (Test-Path $apiDir)) {
  throw "api folder not found in $AppDir"
}

Set-Location $AppDir

Write-Host "==> git fetch/pull ($Branch)"
$scriptPath = $MyInvocation.MyCommand.Path
$scriptHashBefore = $null
if ($scriptPath -and (Test-Path $scriptPath)) {
  $scriptHashBefore = (Get-FileHash -Path $scriptPath -Algorithm SHA256).Hash
}
git fetch --all --prune
git checkout $Branch
git reset --hard "origin/$Branch"

# Re-launch if this script itself changed (PowerShell keeps the old copy in memory)
if ($scriptPath -and (Test-Path $scriptPath) -and $scriptHashBefore) {
  $scriptHashAfter = (Get-FileHash -Path $scriptPath -Algorithm SHA256).Hash
  if ($scriptHashAfter -ne $scriptHashBefore -and -not $env:MG_UPDATE_REEXEC) {
    Write-Host "==> update-from-git.ps1 changed on pull - re-executing fresh copy"
    $env:MG_UPDATE_REEXEC = "1"
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath) + $args
    $p = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
      -ArgumentList $argList -WorkingDirectory $AppDir -Wait -PassThru -NoNewWindow
    exit $p.ExitCode
  }
}
Remove-Item Env:MG_UPDATE_REEXEC -ErrorAction SilentlyContinue

# Keep data; patch required .env keys for headed Chrome + catalog scrapers
$envFile = Join-Path $apiDir ".env"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $apiDir ".env.example") $envFile -ErrorAction SilentlyContinue
}
if (Test-Path $envFile) {
  Write-Host "==> patch api\.env for headed CDP scrapers"
  Set-EnvValue $envFile "SCRAPER_AUTOSTART" "true"
  Set-EnvValue $envFile "SCRAPER_PERSIST" "true"
  Set-EnvValue $envFile "SCRAPER_CDP_URL" "http://127.0.0.1:$CdpPort"
  Set-EnvValue $envFile "SCRAPER_CDP_AUTOSTART" "true"
  Set-EnvValue $envFile "SCRAPER_CDP_HEADLESS" "false"
  Set-EnvValue $envFile "SCRAPER_CDP_FALLBACK_LAUNCH" "false"
  Set-EnvValue $envFile "SCRAPER_SOURCES" "copart,iaai,copart_uk,manheim,salvage_market,encar"
}

Write-Host "==> Python deps"
Refresh-Path
$PythonExe = $null
foreach ($cmd in @("python", "python3")) {
  $c = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($c -and $c.Source -and (Test-Path $c.Source) -and ($c.Source -notmatch 'WindowsApps\\python')) {
    $PythonExe = $c.Source
    break
  }
}
if (-not $PythonExe) {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    try { $PythonExe = (& py -3 -c "import sys; print(sys.executable)").Trim() } catch {}
  }
}

$venvDir = Join-Path $apiDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$venvPip = Join-Path $venvDir "Scripts\pip.exe"
if (-not (Test-Path $venvPython)) {
  if (-not $PythonExe) { throw "Python not found. Install Python 3.12 and reopen PowerShell." }
  & $PythonExe -m venv $venvDir
}
& $venvPip install -q --upgrade pip
& $venvPip install -q -r (Join-Path $apiDir "requirements.txt")

$pwBrowsers = Join-Path $apiDir ".pw-browsers"
New-Item -ItemType Directory -Force -Path $pwBrowsers | Out-Null
$env:PLAYWRIGHT_BROWSERS_PATH = $pwBrowsers
& $venvPython -m playwright install chromium

$dataDir = Join-Path $apiDir "data"
$uploadsDir = Join-Path $dataDir "uploads"
$profileDir = Join-Path $dataDir "chrome-profile"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $uploadsDir | Out-Null
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

if ($env:SKIP_CHROME -ne "1") {
  Write-Host "==> ensure HEADED Chrome CDP (tabs for scrapers)"
  $chromeInstall = Join-Path $apiDir "deploy\install-chrome-cdp-service.ps1"
  $watchdog = Join-Path $apiDir "scripts\chrome-cdp-watchdog.ps1"
  $psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

  # Never start NSSM mg-chrome-cdp for headed mode (Session 0 = invisible / port steal)
  try { Stop-Service -Name "mg-chrome-cdp" -Force -ErrorAction SilentlyContinue } catch {}
  $nssmSilent = Join-Path $apiDir "deploy\nssm.exe"
  if (Test-Path $nssmSilent) {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    & $nssmSilent stop "mg-chrome-cdp" 2>&1 | Out-Null
    & $nssmSilent set "mg-chrome-cdp" Start SERVICE_DISABLED 2>&1 | Out-Null
    $ErrorActionPreference = $prevEap
  }

  # Prefer one-shot interactive start (works when CI/SSH has a logged-on desktop)
  $startNow = Join-Path $apiDir "deploy\start-headed-chrome.ps1"
  if (Test-Path $startNow) {
    try {
      powershell -ExecutionPolicy Bypass -File $startNow -AppDir $AppDir -Port $CdpPort -SkipApiRestart
    } catch {
      Write-Host "  start-headed-chrome: $_" -ForegroundColor Yellow
    }
  } elseif (Test-Path $chromeInstall) {
    try {
      powershell -ExecutionPolicy Bypass -File $chromeInstall -AppDir $AppDir -Headless 0
    } catch {
      Write-Host "  install-chrome-cdp-service: $_" -ForegroundColor Yellow
    }
  }

  try { Start-ScheduledTask -TaskName "MG-Chrome-CDP" -ErrorAction SilentlyContinue } catch {}

  if (-not (Test-Cdp $CdpPort)) {
    Write-Host "  CDP down - starting watchdog directly in current session"
    if (Test-Path $watchdog) {
      Start-Process -FilePath $psExe -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", $watchdog,
        "-Port", "$CdpPort",
        "-ProfileDir", $profileDir,
        "-Headless", "0"
      ) -WorkingDirectory $apiDir -WindowStyle Minimized
    }
  }

  $ok = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Cdp $CdpPort) { $ok = $true; break }
  }
  if ($ok) {
    Write-Host "  CDP OK on :$CdpPort"
  } else {
    Write-Host "  CDP NOT ready - scrapers will retry via SCRAPER_CDP_AUTOSTART" -ForegroundColor Yellow
  }
}

# Website rebuild optional (slow). CI sets SKIP_WEBSITE=1 by default above.
if ($env:SKIP_WEBSITE -ne "1") {
  $deployWebsite = Join-Path $apiDir "deploy\deploy-website.ps1"
  Refresh-Path
  if ((Test-Path $deployWebsite) -and (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "==> rebuild website"
    try {
      $env:SKIP_SERVICE_RESTART = "1"
      powershell -ExecutionPolicy Bypass -File $deployWebsite
    } catch {
      Write-Host "  Website build failed: $_" -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "==> website rebuild skipped (SKIP_WEBSITE=1)"
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  $nssmExe = Join-Path $apiDir "deploy\nssm.exe"
  if (Test-Path $nssmExe) {
    Write-Host "==> NSSM: port $Port"
    & $nssmExe set $ServiceName AppParameters "app.main:app --host 0.0.0.0 --port $Port" | Out-Null
    & $nssmExe set $ServiceName AppEnvironmentExtra "PLAYWRIGHT_BROWSERS_PATH=$pwBrowsers" | Out-Null
  }
  Write-Host "==> restart $ServiceName"
  Restart-Service -Name $ServiceName -Force
  Start-Sleep -Seconds 8
  Get-Service -Name $ServiceName | Format-List Name, Status, StartType
} else {
  Write-Host "==> service $ServiceName not found - start uvicorn manually" -ForegroundColor Yellow
}

Write-Host "==> health check"
$healthUrl = "http://127.0.0.1:$Port/health"
try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 20
  Write-Host "  $($resp.StatusCode) $($resp.Content)"
} catch {
  Write-Host "  Health not ready yet ($healthUrl): $_" -ForegroundColor Yellow
}

Write-Host "==> scraper status"
try {
  $st = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/v1/scraper/status" -UseBasicParsing -TimeoutSec 20
  Write-Host $st.Content.Substring(0, [Math]::Min(500, $st.Content.Length))
} catch {
  Write-Host "  scraper status: $_" -ForegroundColor Yellow
}

Write-Host "Done. Site: http://91.149.133.54/  Catalog API: http://91.149.133.54/api/v1/lots"
Write-Host "Chrome must stay headed; AnyDesk = Disconnect only (no Log off)."
