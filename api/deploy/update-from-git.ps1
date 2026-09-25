# Обновление MG.GROUP API на Windows Server из GitHub (CI или вручную).
# Пример: powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\update-from-git.ps1
$ErrorActionPreference = "Stop"

$AppDir = if ($env:APP_DIR) { $env:APP_DIR } else { "C:\mg-api" }
$Branch = if ($env:BRANCH) { $env:BRANCH } else { "main" }
$ServiceName = if ($env:SERVICE_NAME) { $env:SERVICE_NAME } else { "mg-api" }
$Port = if ($env:API_PORT) { [int]$env:API_PORT } else { 8000 }

$apiDir = Join-Path $AppDir "api"
if (-not (Test-Path (Join-Path $AppDir ".git"))) {
  throw "Нет git-репозитория в $AppDir. Сначала: git clone <repo> $AppDir и api\deploy\install-windows.ps1"
}
if (-not (Test-Path $apiDir)) {
  throw "Не найден каталог api в $AppDir"
}

Set-Location $AppDir

Write-Host "==> git fetch/pull ($Branch)"
git fetch --all --prune
git checkout $Branch
git reset --hard "origin/$Branch"

# НЕ трогаем: api\.env, api\data\cabinet.db, api\data\uploads, lib\auctions\generated-lots.json

Write-Host "==> Python deps"
$venvDir = Join-Path $apiDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$venvPip = Join-Path $venvDir "Scripts\pip.exe"
if (-not (Test-Path $venvPython)) {
  python -m venv $venvDir
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

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host "==> restart $ServiceName"
  Restart-Service -Name $ServiceName -Force
  Start-Sleep -Seconds 4
  Get-Service -Name $ServiceName | Format-List Name, Status, StartType
} else {
  Write-Host "==> служба $ServiceName не найдена — перезапустите uvicorn вручную" -ForegroundColor Yellow
}

Write-Host "==> health check"
$healthUrl = "http://127.0.0.1:$Port/health"
try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 15
  Write-Host "  $($resp.StatusCode) $($resp.Content)"
} catch {
  Write-Host "  Health пока недоступен ($healthUrl): $_" -ForegroundColor Yellow
}

Write-Host "Готово."
