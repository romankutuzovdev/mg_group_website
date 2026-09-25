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

function Install-CaddyExe {
  param([string]$DestExe, [string]$DestDir)

  # Prefer GitHub release ZIP (plain Deflate). The caddyserver.com/api/download
  # build often produces archives that Expand-Archive rejects
  # ("spanned/split archives not supported" / "составные архивы не поддерживаются").
  $version = "2.11.4"
  $zipName = "caddy_${version}_windows_amd64.zip"
  $urls = [System.Collections.Generic.List[string]]::new()
  $urls.Add("https://github.com/caddyserver/caddy/releases/download/v$version/$zipName")
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/caddyserver/caddy/releases/latest" -Headers @{ "User-Agent" = "mg-group-ssl" }
    $asset = $rel.assets | Where-Object { $_.name -match 'windows_amd64\.zip$' -and $_.name -notmatch '\.sig$' } | Select-Object -First 1
    if ($asset -and $asset.browser_download_url) {
      $urls.Insert(0, [string]$asset.browser_download_url)
    }
  } catch {
    Write-Host "  (latest release lookup skipped: $_)" -ForegroundColor DarkGray
  }

  $zip = Join-Path $env:TEMP "caddy-windows-amd64.zip"
  $ok = $false
  foreach ($url in $urls) {
    Write-Host "==> download Caddy: $url"
    try {
      if (Test-Path $zip) { Remove-Item $zip -Force }
      # TLS 1.2 + long timeout; avoid partial HTML/error bodies
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 300
      $len = (Get-Item $zip).Length
      if ($len -lt 1MB) {
        Write-Host "  skip: file too small ($len bytes) - not a real release zip" -ForegroundColor Yellow
        continue
      }
      $fs = [IO.File]::OpenRead($zip)
      try {
        $b0 = $fs.ReadByte(); $b1 = $fs.ReadByte()
      } finally { $fs.Close() }
      if ($b0 -ne 0x50 -or $b1 -ne 0x4B) {
        Write-Host "  skip: not a ZIP (missing PK header)" -ForegroundColor Yellow
        continue
      }
      $ok = $true
      break
    } catch {
      Write-Host "  download failed: $_" -ForegroundColor Yellow
    }
  }
  if (-not $ok) {
    throw "Could not download a valid Caddy windows_amd64.zip from GitHub."
  }

  $extract = Join-Path $env:TEMP ("caddy-extract-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $extract | Out-Null
  try {
    # tar.exe (Win10+) handles more ZIP variants than Expand-Archive
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) {
      & tar.exe -xf $zip -C $extract
      if ($LASTEXITCODE -ne 0) { throw "tar extract failed ($LASTEXITCODE)" }
    } else {
      Expand-Archive -Path $zip -DestinationPath $extract -Force
    }
    $found = Get-ChildItem -Path $extract -Recurse -Filter "caddy.exe" | Select-Object -First 1
    if (-not $found) { throw "caddy.exe missing inside $zip" }
    Copy-Item $found.FullName $DestExe -Force
  } finally {
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
  }

  if (-not (Test-Path $DestExe)) {
    throw "caddy.exe not installed at $DestExe"
  }
  Write-Host "==> caddy.exe ready: $DestExe ($((Get-Item $DestExe).Length) bytes)"
}

if (-not (Test-Path $caddyExe)) {
  Install-CaddyExe -DestExe $caddyExe -DestDir $caddyDir
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
# UTF-8 without BOM (BOM breaks Caddy parse on Windows)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($caddyfile, $cf, $utf8NoBom)
Write-Host "Caddyfile:"
Get-Content $caddyfile | ForEach-Object { Write-Host "  $_" }

Write-Host "==> firewall 80/443"
foreach ($port in @(80, 443)) {
  $rule = "MG-Caddy-$port"
  if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
  }
}

function Show-PortOwner([int]$Port) {
  Write-Host "Port $Port listeners:"
  try {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object {
        $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        Write-Host ("  PID {0} {1}" -f $_.OwningProcess, $(if ($p) { $p.ProcessName } else { "?" }))
      }
  } catch {
    netstat -ano | Select-String ":$Port\s" | ForEach-Object { Write-Host "  $_" }
  }
}

Write-Host "==> check ports 80/443 free (or already Caddy)"
foreach ($port in @(80, 443)) {
  $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    Show-PortOwner $port
    $names = @()
    foreach ($c in $busy) {
      $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
      if ($proc) { $names += $proc.ProcessName }
    }
    $unique = $names | Select-Object -Unique
    if ($unique -notcontains "caddy") {
      Write-Host "WARNING: port $port is in use by: $($unique -join ', ')" -ForegroundColor Yellow
      Write-Host "Stop IIS / http.sys / other web servers, or Caddy cannot bind." -ForegroundColor Yellow
    }
  }
}

# Stop IIS / World Wide Web if present (common on Windows Server)
foreach ($svcName in @("W3SVC", "WAS")) {
  $s = Get-Service -Name $svcName -ErrorAction SilentlyContinue
  if ($s -and $s.Status -eq "Running") {
    Write-Host "==> stop IIS service $svcName (frees :80/:443)"
    Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
    & sc.exe config $svcName start= disabled | Out-Null
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

# Data dir for certs (SYSTEM account has no useful HOME)
$dataDir = Join-Path $caddyDir "data"
$configDir = Join-Path $caddyDir "config"
New-Item -ItemType Directory -Force -Path $dataDir, $configDir | Out-Null

Write-Host "==> validate Caddyfile"
$prev = Get-Location
try {
  Set-Location $caddyDir
  $env:HOME = $caddyDir
  $env:XDG_DATA_HOME = $dataDir
  $env:XDG_CONFIG_HOME = $configDir
  & $caddyExe version
  & $caddyExe validate --config $caddyfile --adapter caddyfile
  if ($LASTEXITCODE -ne 0) {
    throw "caddy validate failed (exit $LASTEXITCODE). Fix Caddyfile above."
  }
} finally {
  Set-Location $prev
}

Write-Host "==> install / restart Caddy service $CaddyService"
$existing = Get-Service -Name $CaddyService -ErrorAction SilentlyContinue
if ($existing) {
  & $nssm stop $CaddyService 2>$null
  Start-Sleep -Seconds 1
  & $nssm remove $CaddyService confirm 2>$null
  Start-Sleep -Seconds 1
}

$outLog = Join-Path $caddyDir "caddy-out.log"
$errLog = Join-Path $caddyDir "caddy-err.log"
# Relative Caddyfile + AppDirectory avoids NSSM quoting bugs with C:\ paths
& $nssm install $CaddyService $caddyExe
& $nssm set $CaddyService AppDirectory $caddyDir
& $nssm set $CaddyService AppParameters "run --config Caddyfile --adapter caddyfile"
& $nssm set $CaddyService AppEnvironmentExtra "HOME=$caddyDir" "XDG_DATA_HOME=$dataDir" "XDG_CONFIG_HOME=$configDir"
& $nssm set $CaddyService DisplayName "MG.GROUP Caddy HTTPS"
& $nssm set $CaddyService Description "Let's Encrypt HTTPS reverse proxy to mg-api on 127.0.0.1:$BackendPort"
& $nssm set $CaddyService Start SERVICE_AUTO_START
& $nssm set $CaddyService ObjectName LocalSystem
& $nssm set $CaddyService AppStdout $outLog
& $nssm set $CaddyService AppStderr $errLog
& $nssm set $CaddyService AppRotateFiles 1
& $nssm set $CaddyService AppExit Default Restart
& $nssm set $CaddyService AppRestartDelay 3000
# Give ACME a few seconds before NSSM treats exit as failure on first boot
& $nssm set $CaddyService AppThrottle 5000

Write-Host "==> start $CaddyService"
try {
  Start-Service -Name $CaddyService
} catch {
  Write-Host "Start-Service failed: $_" -ForegroundColor Red
}
Start-Sleep -Seconds 5
$st = Get-Service $CaddyService
Get-Service $CaddyService | Format-List Name, Status, StartType

if ($st.Status -ne "Running") {
  Write-Host ""
  Write-Host "Caddy did not stay running. Diagnostics:" -ForegroundColor Red
  Show-PortOwner 80
  Show-PortOwner 443
  Write-Host "--- caddy-err.log ---"
  if (Test-Path $errLog) { Get-Content $errLog -Tail 60 } else { Write-Host "(no err log yet)" }
  Write-Host "--- caddy-out.log ---"
  if (Test-Path $outLog) { Get-Content $outLog -Tail 40 } else { Write-Host "(no out log yet)" }
  Write-Host "--- manual test (Ctrl+C to stop) ---"
  Write-Host "  cd $caddyDir"
  Write-Host "  `$env:HOME='$caddyDir'; `$env:XDG_DATA_HOME='$dataDir'"
  Write-Host "  .\caddy.exe run --config Caddyfile --adapter caddyfile"
  throw "mg-caddy failed to start. Fix errors above, then re-run this script."
}

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
Write-Host " Logs:  $errLog"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "If cert fails: check DNS A=$Domain -> this IP, firewall 80/443, wait 1-2 min, then:"
Write-Host "  Restart-Service $CaddyService"
Write-Host "  Get-Content $errLog -Tail 40"
Write-Host ""
Write-Host "Test:"
Write-Host "  Invoke-WebRequest https://$Domain/health -UseBasicParsing"
