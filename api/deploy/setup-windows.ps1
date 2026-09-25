# Full install of MG.GROUP API on Windows Server (run as Administrator).
#   powershell -ExecutionPolicy Bypass -File .\api\deploy\setup-windows.ps1
#
# Optional:
#   -RepoUrl "https://github.com/romankutuzovdev/mg_group_website.git"
#   -AppDir  "C:\mg-api"
#   -Port 80
#   -SkipService

param(
  [string]$RepoUrl = "https://github.com/romankutuzovdev/mg_group_website.git",
  [string]$AppDir = "C:\mg-api",
  [string]$ServiceName = "mg-api",
  [int]$Port = 80,
  [switch]$SkipService
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step([string]$Msg) {
  Write-Host ""
  Write-Host "==> $Msg" -ForegroundColor Cyan
}

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run PowerShell as Administrator."
  }
}

function Assert-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing: $Name. $Hint"
  }
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Resolve-PythonExe {
  Refresh-Path

  foreach ($cmd in @("python", "python3")) {
    $c = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($c -and $c.Source -and (Test-Path $c.Source)) {
      # Skip Windows Store stub
      if ($c.Source -match 'WindowsApps\\python') { continue }
      return $c.Source
    }
  }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    try {
      $viaPy = & py -3 -c "import sys; print(sys.executable)" 2>$null
      if ($viaPy -and (Test-Path $viaPy.Trim())) { return $viaPy.Trim() }
    } catch {}
  }

  $roots = @(
    "$env:LocalAppData\Programs\Python",
    "$env:ProgramFiles\Python*",
    "${env:ProgramFiles(x86)}\Python*",
    "C:\Python*"
  )
  $found = Get-ChildItem -Path $roots -Filter "python.exe" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\WindowsApps\\' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($found) { return $found.FullName }

  throw @"
Python not found in PATH.
1) Reinstall Python 3.12 from https://www.python.org/downloads/windows/
2) Enable checkbox: Add python.exe to PATH
3) Close ALL PowerShell windows and open a NEW Administrator PowerShell
4) Check:  python --version   OR   py -3 --version
"@
}

function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
  $lines = @()
  if (Test-Path $Path) {
    $lines = Get-Content $Path
  }
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
      $found = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $found) {
    $out = @($out) + "$Key=$Value"
  }
  $out | Set-Content -Path $Path -Encoding UTF8
}

function Install-Nssm([string]$DestDir) {
  $nssmExe = Join-Path $DestDir "nssm.exe"
  if (Test-Path $nssmExe) { return $nssmExe }
  if (Get-Command nssm -ErrorAction SilentlyContinue) {
    return (Get-Command nssm).Source
  }

  Write-Step "Downloading NSSM"
  $zip = Join-Path $env:TEMP "nssm-2.24.zip"
  $extract = Join-Path $env:TEMP "nssm-extract"
  Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip -UseBasicParsing
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extract -Force
  $src = Get-ChildItem -Path $extract -Recurse -Filter "nssm.exe" |
    Where-Object { $_.FullName -match '\\win64\\nssm\.exe$' } |
    Select-Object -First 1
  if (-not $src) { throw "nssm.exe not found in archive." }
  New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
  Copy-Item $src.FullName $nssmExe -Force
  return $nssmExe
}

Assert-Admin
Write-Step "Checking Git / Python"
Assert-Command git "Install Git: https://git-scm.com/download/win"
$PythonExe = Resolve-PythonExe
Write-Host "Using Python: $PythonExe"

$pyVer = & $PythonExe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
Write-Host "Python $pyVer"
if ([version]$pyVer -lt [version]"3.10") {
  throw "Need Python 3.10+, found $pyVer"
}

Write-Step "Repository -> $AppDir"
if (Test-Path (Join-Path $AppDir ".git")) {
  Set-Location $AppDir
  git fetch --all --prune
  git checkout main
  git reset --hard origin/main
} elseif (Test-Path $AppDir) {
  throw "Folder $AppDir exists but is not a git repo. Delete it or pass another -AppDir."
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $AppDir -Parent) | Out-Null
  git clone $RepoUrl $AppDir
  Set-Location $AppDir
}

$apiDir = Join-Path $AppDir "api"
$deployDir = Join-Path $apiDir "deploy"
$envExample = Join-Path $apiDir ".env.example"
$envFile = Join-Path $apiDir ".env"

if (-not (Test-Path $apiDir)) {
  throw "api folder not found in $AppDir. Clone mg_group_website first."
}

Write-Step ".env"
if (-not (Test-Path $envFile)) {
  if (Test-Path $envExample) {
    Copy-Item $envExample $envFile
  } else {
    @"
INGEST_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
JWT_SECRET=change-me-to-a-long-random-string
CABINET_ADMIN_TELEGRAM_IDS=
SCRAPER_AUTOSTART=true
SCRAPER_SOURCES=copart,iaai,copart_uk,manheim,salvage_market,encar
SCRAPER_INTERVAL_SECONDS=600
SCRAPER_PERSIST=true
SCRAPER_HEADLESS=false
SCRAPER_CDP_URL=http://127.0.0.1:9223
SCRAPER_PRUNE_ENDED=true
SCRAPER_AUCTION_GRACE_HOURS=3
SCRAPER_PHOTOS_ENABLED=true
"@ | Set-Content -Path $envFile -Encoding UTF8
  }
}

if (-not ((Get-Content $envFile -Raw) -match '(?m)^SCRAPER_CDP_URL=')) {
  Set-EnvValue $envFile "SCRAPER_CDP_URL" "http://127.0.0.1:9223"
}
if (-not ((Get-Content $envFile -Raw) -match '(?m)^SCRAPER_CDP_AUTOSTART=')) {
  Set-EnvValue $envFile "SCRAPER_CDP_AUTOSTART" "true"
}
if (-not ((Get-Content $envFile -Raw) -match '(?m)^SCRAPER_CDP_HEADLESS=')) {
  Set-EnvValue $envFile "SCRAPER_CDP_HEADLESS" "true"
}
if (-not ((Get-Content $envFile -Raw) -match '(?m)^SCRAPER_CDP_FALLBACK_LAUNCH=')) {
  Set-EnvValue $envFile "SCRAPER_CDP_FALLBACK_LAUNCH" "false"
}
if (-not ((Get-Content $envFile -Raw) -match '(?m)^SCRAPER_HEADLESS=')) {
  Set-EnvValue $envFile "SCRAPER_HEADLESS" "false"
}
if (-not ((Get-Content $envFile -Raw) -match '(?m)^SCRAPER_AUTOSTART=')) {
  Set-EnvValue $envFile "SCRAPER_AUTOSTART" "true"
}
if (-not ((Get-Content $envFile -Raw) -match '(?m)^SCRAPER_PERSIST=')) {
  Set-EnvValue $envFile "SCRAPER_PERSIST" "true"
}

Write-Step "Python venv + dependencies"
$venvDir = Join-Path $apiDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$venvPip = Join-Path $venvDir "Scripts\pip.exe"
$uvicornExe = Join-Path $venvDir "Scripts\uvicorn.exe"
if (-not (Test-Path $venvPython)) {
  & $PythonExe -m venv $venvDir
}
& $venvPip install --upgrade pip
& $venvPip install -r (Join-Path $apiDir "requirements.txt")

$pwBrowsers = Join-Path $apiDir ".pw-browsers"
New-Item -ItemType Directory -Force -Path $pwBrowsers | Out-Null
$env:PLAYWRIGHT_BROWSERS_PATH = $pwBrowsers
& $venvPython -m playwright install chromium

$dataDir = Join-Path $apiDir "data"
$uploadsDir = Join-Path $dataDir "uploads"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $uploadsDir | Out-Null

if (-not $SkipService) {
  $nssmExe = Install-Nssm $deployDir
  Write-Step "Windows service: $ServiceName (port $Port)"
  $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($existing) {
    & $nssmExe stop $ServiceName 2>$null
    Start-Sleep -Seconds 1
    & $nssmExe remove $ServiceName confirm
  }
  & $nssmExe install $ServiceName $uvicornExe
  & $nssmExe set $ServiceName AppParameters "app.main:app --host 0.0.0.0 --port $Port"
  & $nssmExe set $ServiceName AppDirectory $apiDir
  & $nssmExe set $ServiceName AppEnvironmentExtra "PLAYWRIGHT_BROWSERS_PATH=$pwBrowsers"
  & $nssmExe set $ServiceName Start SERVICE_AUTO_START
  & $nssmExe set $ServiceName AppStdout (Join-Path $dataDir "service-out.log")
  & $nssmExe set $ServiceName AppStderr (Join-Path $dataDir "service-err.log")
  & $nssmExe set $ServiceName AppRotateFiles 1
  Start-Service $ServiceName
  Start-Sleep -Seconds 3
  Get-Service $ServiceName | Format-List Name, Status, StartType
} else {
  Write-Host "Service skipped (-SkipService). Run manually:"
  Write-Host "  cd $apiDir"
  Write-Host "  $uvicornExe app.main:app --host 0.0.0.0 --port $Port"
}

try {
  $ruleName = "MG API $Port"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    Write-Step "Firewall: TCP $Port"
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
  }
} catch {
  Write-Host "Firewall rule not created: $_" -ForegroundColor Yellow
}

$chromeBat = Join-Path $apiDir "scripts\start-chrome-cdp.bat"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Done."
Write-Host " AppDir:      $AppDir"
Write-Host " API dir:     $apiDir"
Write-Host " Health:      http://127.0.0.1:$Port/health"
Write-Host " Docs:        http://127.0.0.1:$Port/docs"
Write-Host " Logs:        $dataDir\service-out.log / service-err.log"
Write-Host " .env:        $envFile  (fill Telegram / JWT / scraper)"
Write-Host " Chrome CDP:  $chromeBat"
Write-Host " Update:      powershell -ExecutionPolicy Bypass -File $(Join-Path $deployDir 'update-from-git.ps1')"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Before scrapers, start Chrome with CDP:" -ForegroundColor Yellow
Write-Host "  $chromeBat"
