# Install / repair Windows service that keeps headless Chrome CDP alive
# independently of AnyDesk / RDP user sessions.
#
# Usage (Admin):
#   powershell -ExecutionPolicy Bypass -File api\deploy\install-chrome-cdp-service.ps1

param(
  [string]$AppDir = "C:\mg-api",
  [string]$ServiceName = "mg-chrome-cdp",
  [int]$Port = 9223
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run as Administrator."
  }
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

if (-not (Test-Path $watchdog)) {
  throw "Missing $watchdog - pull latest repo first."
}
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$nssmExe = Install-Nssm $deployDir
$psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$appParams = "-NoProfile -ExecutionPolicy Bypass -File `"$watchdog`" -Port $Port -ProfileDir `"$profileDir`""

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  & $nssmExe stop $ServiceName 2>$null
  Start-Sleep -Seconds 1
  & $nssmExe remove $ServiceName confirm
}

& $nssmExe install $ServiceName $psExe
& $nssmExe set $ServiceName AppParameters $appParams
& $nssmExe set $ServiceName AppDirectory $apiDir
& $nssmExe set $ServiceName DisplayName "MG.GROUP Chrome CDP (headless)"
& $nssmExe set $ServiceName Description "Headless Chrome remote-debugging for scrapers. Survives AnyDesk disconnect."
& $nssmExe set $ServiceName Start SERVICE_AUTO_START
& $nssmExe set $ServiceName AppStdout (Join-Path $dataDir "chrome-cdp-out.log")
& $nssmExe set $ServiceName AppStderr (Join-Path $dataDir "chrome-cdp-err.log")
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppExit Default Restart
& $nssmExe set $ServiceName AppRestartDelay 4000
& $nssmExe set $ServiceName AppStopMethodSkip 0

Start-Service $ServiceName
Start-Sleep -Seconds 5
Get-Service $ServiceName | Format-List Name, Status, StartType

Write-Host ""
Write-Host "Chrome CDP service installed: $ServiceName" -ForegroundColor Green
Write-Host "  Port:    $Port"
Write-Host "  Profile: $profileDir"
Write-Host "  Logs:    $dataDir\chrome-cdp-out.log"
Write-Host "  Check:   curl http://127.0.0.1:$Port/json/version"
Write-Host ""
Write-Host "Keep SCRAPER_CDP_HEADLESS=true and SCRAPER_CDP_URL=http://127.0.0.1:$Port in api\.env"
Write-Host "Do not start GUI Chrome for scrapers if you leave AnyDesk."
