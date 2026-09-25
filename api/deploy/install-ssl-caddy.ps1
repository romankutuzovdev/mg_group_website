# Install HTTPS (Let's Encrypt) for MG.GROUP on Windows via Caddy reverse proxy.
# No Cloudflare needed. DNS A-record for the domain MUST point to this server.
#
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\install-ssl-caddy.ps1
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\install-ssl-caddy.ps1 -Domain mg-group.by -Email you@example.com
#
# What it does:
#   1) Moves mg-api (uvicorn) to 127.0.0.1:8080
#   2) Installs Caddy on :80 + :443 with automatic Let's Encrypt cert
#   3) reverse_proxy -> 127.0.0.1:8080 (site + /api)
#   4) Opens Windows Firewall for 80/443

param(
  [string]$AppDir = "C:\mg-api",
  [string]$Domain = "mg-group.by",
  [string]$WwwDomain = "www.mg-group.by",
  [string]$Email = "",
  [string]$ApiService = "mg-api",
  [string]$CaddyService = "mg-caddy",
  [int]$BackendPort = 8080
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run as Administrator."
  }
}

function Get-Nssm([string]$ApiDir) {
  $local = Join-Path $ApiDir "deploy\nssm.exe"
  if (Test-Path $local) { return $local }
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "nssm.exe not found. Expected at $local"
}

Assert-Admin

$apiDir = Join-Path $AppDir "api"
$deployDir = Join-Path $apiDir "deploy"
$caddyDir = Join-Path $AppDir "caddy"
$caddyExe = Join-Path $caddyDir "caddy.exe"
$caddyfile = Join-Path $caddyDir "Caddyfile"
$marker = Join-Path $deployDir ".behind-caddy"
$nssm = Get-Nssm $apiDir

if (-not $Email) {
  $Email = "ssl@$Domain"
}

Write-Host "==> Domain: $Domain (+ $WwwDomain)"
Write-Host "==> Email for Let's Encrypt: $Email"
Write-Host "==> Backend uvicorn will listen on 127.0.0.1:$BackendPort"
Write-Host ""
Write-Host "IMPORTANT: DNS A for $Domain and $WwwDomain must point to THIS server IP." -ForegroundColor Yellow
Write-Host "Ports 80 and 443 must be open in the cloud firewall / security group." -ForegroundColor Yellow
Write-Host ""

# Resolve domain quickly (warning only)
try {
  $resolved = [System.Net.Dns]::GetHostAddresses($Domain) | ForEach-Object { $_.IPAddressToString }
  Write-Host "DNS $Domain => $($resolved -join ', ')"
} catch {
  Write-Host "WARNING: cannot resolve $Domain yet: $_" -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null

if (-not (Test-Path $caddyExe)) {
  Write-Host "==> download Caddy (windows amd64)"
  $zip = Join-Path $env:TEMP "caddy-windows-amd64.zip"
  # Official release asset naming varies; use caddyserver download API
  $url = "https://caddyserver.com/api/download?os=windows&arch=amd64"
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $caddyDir -Force
  if (-not (Test-Path $caddyExe)) {
    $found = Get-ChildItem -Path $caddyDir -Recurse -Filter "caddy.exe" | Select-Object -First 1
    if (-not $found) { throw "caddy.exe not found after download" }
    Copy-Item $found.FullName $caddyExe -Force
  }
}

Write-Host "==> write Caddyfile"
$hosts = @($Domain)
if ($WwwDomain -and $WwwDomain -ne $Domain) { $hosts += $WwwDomain }
$hostLine = ($hosts -join ", ")
$cf = @"
{
	email $Email
}

$hostLine {
	encode gzip
	reverse_proxy 127.0.0.1:$BackendPort
}
"@
# Caddyfile must be UTF-8 without weird dashes
[System.IO.File]::WriteAllText($caddyfile, $cf)

Write-Host "==> firewall 80/443"
foreach ($port in @(80, 443)) {
  $rule = "MG-Caddy-$port"
  if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
  }
}

Write-Host "==> move $ApiService to 127.0.0.1:$BackendPort"
$apiSvc = Get-Service -Name $ApiService -ErrorAction SilentlyContinue
if (-not $apiSvc) {
  throw "Service $ApiService not found. Install API first (install-windows / setup-windows)."
}

# Stop API while rebinding
Stop-Service -Name $ApiService -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

& $nssm set $ApiService AppParameters "app.main:app --host 127.0.0.1 --port $BackendPort" | Out-Null
# Keep existing AppDirectory / AppEnvironmentExtra
Start-Service -Name $ApiService
Start-Sleep -Seconds 5

try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/health" -UseBasicParsing -TimeoutSec 10
  Write-Host "Backend health: $($h.StatusCode) $($h.Content)"
} catch {
  Write-Host "WARNING: backend health check failed on :$BackendPort - $_" -ForegroundColor Yellow
}

Write-Host "==> install / restart Caddy service $CaddyService"
$existing = Get-Service -Name $CaddyService -ErrorAction SilentlyContinue
if ($existing) {
  & $nssm stop $CaddyService 2>$null
  Start-Sleep -Seconds 1
  & $nssm remove $CaddyService confirm 2>$null
  Start-Sleep -Seconds 1
}

& $nssm install $CaddyService $caddyExe
& $nssm set $CaddyService AppParameters "run --config `"$caddyfile`" --adapter caddyfile"
& $nssm set $CaddyService AppDirectory $caddyDir
& $nssm set $CaddyService DisplayName "MG.GROUP Caddy HTTPS"
& $nssm set $CaddyService Description "Let's Encrypt HTTPS reverse proxy to mg-api on 127.0.0.1:$BackendPort"
& $nssm set $CaddyService Start SERVICE_AUTO_START
& $nssm set $CaddyService AppStdout (Join-Path $caddyDir "caddy-out.log")
& $nssm set $CaddyService AppStderr (Join-Path $caddyDir "caddy-err.log")
& $nssm set $CaddyService AppRotateFiles 1
& $nssm set $CaddyService AppExit Default Restart
& $nssm set $CaddyService AppRestartDelay 3000

Start-Service -Name $CaddyService
Start-Sleep -Seconds 4
Get-Service $CaddyService | Format-List Name, Status, StartType

# Marker so update-from-git keeps backend on 8080
@"
BEHIND_CADDY=1
BACKEND_PORT=$BackendPort
DOMAIN=$Domain
INSTALLED=$(Get-Date -Format o)
"@ | Set-Content -Path $marker -Encoding ASCII

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " HTTPS install done"
Write-Host " Open:  https://$Domain/"
Write-Host " API:   https://$Domain/api/v1/lots"
Write-Host " Logs:  $caddyDir\caddy-err.log"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "If cert fails: check DNS A=$Domain -> this IP, firewall 80/443, wait 1-2 min, then:"
Write-Host "  Restart-Service $CaddyService"
Write-Host "  Get-Content $caddyDir\caddy-err.log -Tail 40"
Write-Host ""
Write-Host "Test:"
Write-Host "  Invoke-WebRequest https://$Domain/health -UseBasicParsing"
