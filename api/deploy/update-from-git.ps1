# Update MG.GROUP API on Windows Server from GitHub (CI or manual).
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\update-from-git.ps1
$ErrorActionPreference = "Stop"

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

$AppDir = if ($env:APP_DIR) { $env:APP_DIR } else { "C:\mg-api" }
$Branch = if ($env:BRANCH) { $env:BRANCH } else { "main" }
$Port = if ($env:API_PORT) { [int]$env:API_PORT } else { 80 }
$ServiceName = if ($env:SERVICE_NAME) { $env:SERVICE_NAME } else { "mg-api" }

$apiDir = Join-Path $AppDir "api"
if (-not (Test-Path (Join-Path $AppDir ".git"))) {
  throw "No git repo in $AppDir. First: git clone <repo> $AppDir then api\deploy\install-windows.ps1"
}
if (-not (Test-Path $apiDir)) {
  throw "api folder not found in $AppDir"
}

Set-Location $AppDir

Write-Host "==> git fetch/pull ($Branch)"
git fetch --all --prune
git checkout $Branch
git reset --hard "origin/$Branch"

# Do NOT touch: api\.env, api\data\cabinet.db, api\data\uploads, api\data\lots.json

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
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $uploadsDir | Out-Null

Write-Host "==> ensure Chrome CDP service (survives AnyDesk disconnect)"
$chromeInstall = Join-Path $apiDir "deploy\install-chrome-cdp-service.ps1"
$chromeSvc = Get-Service -Name "mg-chrome-cdp" -ErrorAction SilentlyContinue
if ($chromeSvc) {
  try {
    if ($chromeSvc.Status -ne "Running") {
      Start-Service -Name "mg-chrome-cdp"
      Write-Host "  started mg-chrome-cdp"
    } else {
      Write-Host "  mg-chrome-cdp already running"
    }
  } catch {
    Write-Host "  mg-chrome-cdp start failed: $_" -ForegroundColor Yellow
  }
} elseif (Test-Path $chromeInstall) {
  Write-Host "  installing mg-chrome-cdp service..."
  try {
    powershell -ExecutionPolicy Bypass -File $chromeInstall -AppDir $AppDir
  } catch {
    Write-Host "  install failed: $_" -ForegroundColor Yellow
    Write-Host "  Run manually as Admin: $chromeInstall"
  }
} else {
  $chromeBat = Join-Path $apiDir "scripts\start-chrome-cdp.bat"
  if (Test-Path $chromeBat) {
    try {
      $env:MG_CHROME_HEADLESS = "1"
      Start-Process -FilePath $chromeBat -WindowStyle Hidden | Out-Null
    } catch {
      Write-Host "  Chrome bat start skipped: $_" -ForegroundColor Yellow
    }
  }
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  $nssmExe = Join-Path $apiDir "deploy\nssm.exe"
  if (Test-Path $nssmExe) {
    Write-Host "==> NSSM: port $Port"
    & $nssmExe set $ServiceName AppParameters "app.main:app --host 0.0.0.0 --port $Port" | Out-Null
  }
  Write-Host "==> restart $ServiceName"
  Restart-Service -Name $ServiceName -Force
  Start-Sleep -Seconds 6
  Get-Service -Name $ServiceName | Format-List Name, Status, StartType
} else {
  Write-Host "==> service $ServiceName not found - start uvicorn manually" -ForegroundColor Yellow
}

Write-Host "==> health check"
$healthUrl = "http://127.0.0.1:$Port/health"
try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 15
  Write-Host "  $($resp.StatusCode) $($resp.Content)"
} catch {
  Write-Host "  Health not ready yet ($healthUrl): $_" -ForegroundColor Yellow
}

Write-Host "Done."
