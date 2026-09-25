# Diagnose + repair mg-caddy when Start-Service fails.
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\fix-caddy.ps1

param(
  [string]$AppDir = "C:\mg-api",
  [string]$Domain = "mg-group.by",
  [string]$WwwDomain = "www.mg-group.by",
  [string]$Email = "ssl@mg-group.by",
  [int]$BackendPort = 8080,
  [string]$CaddyService = "mg-caddy"
)

$ErrorActionPreference = "Continue"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run as Administrator."
  }
}

Assert-Admin

$caddyDir = Join-Path $AppDir "caddy"
$caddyExe = Join-Path $caddyDir "caddy.exe"
$caddyfile = Join-Path $caddyDir "Caddyfile"
$dataDir = Join-Path $caddyDir "data"
$configDir = Join-Path $caddyDir "config"
$outLog = Join-Path $caddyDir "caddy-out.log"
$errLog = Join-Path $caddyDir "caddy-err.log"
$nssm = Join-Path $AppDir "api\deploy\nssm.exe"

Write-Host "======== FIX-CADDY DIAG ========" -ForegroundColor Cyan
Write-Host "Admin: yes"
Write-Host "caddyDir: $caddyDir"
Write-Host "caddy.exe exists: $(Test-Path $caddyExe)"
if (Test-Path $caddyExe) {
  $fi = Get-Item $caddyExe
  Write-Host "caddy.exe size: $($fi.Length) bytes  path: $($fi.FullName)"
}

if (-not (Test-Path $nssm)) {
  throw "nssm not found: $nssm"
}

# Find caddy.exe if missing at expected path
if (-not (Test-Path $caddyExe)) {
  $found = Get-ChildItem -Path $caddyDir -Recurse -Filter "caddy.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) {
    Write-Host "Found nested caddy.exe: $($found.FullName) -> copying to $caddyExe"
    Copy-Item $found.FullName $caddyExe -Force
  } else {
    Write-Host "Downloading caddy from GitHub..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null
    $zip = Join-Path $env:TEMP "caddy-fix.zip"
    $url = "https://github.com/caddyserver/caddy/releases/download/v2.11.4/caddy_2.11.4_windows_amd64.zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 300
    $extract = Join-Path $env:TEMP "caddy-fix-extract"
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    tar.exe -xf $zip -C $extract
    $found = Get-ChildItem -Path $extract -Recurse -Filter "caddy.exe" | Select-Object -First 1
    if (-not $found) { throw "download ok but no caddy.exe in zip" }
    Copy-Item $found.FullName $caddyExe -Force
  }
}

New-Item -ItemType Directory -Force -Path $dataDir, $configDir | Out-Null

Write-Host "`n==> caddy version"
& $caddyExe version 2>&1 | ForEach-Object { Write-Host "  $_" }

# Stop IIS if holding 80
foreach ($svcName in @("W3SVC", "WAS")) {
  $s = Get-Service -Name $svcName -ErrorAction SilentlyContinue
  if ($s -and $s.Status -eq "Running") {
    Write-Host "==> stopping IIS $svcName"
    Stop-Service $svcName -Force -ErrorAction SilentlyContinue
    sc.exe config $svcName start= disabled | Out-Null
  }
}

Write-Host "`n==> ports 80/443"
foreach ($port in @(80, 443)) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Host "  :$port free"
    continue
  }
  foreach ($c in $conns) {
    $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "  :$port PID $($c.OwningProcess) $($p.ProcessName)"
    if ($p -and $p.ProcessName -ne "caddy") {
      Write-Host "  -> killing non-caddy listener PID $($c.OwningProcess)" -ForegroundColor Yellow
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}

# Kill stray caddy before reinstall
Get-Process caddy -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "==> stop running caddy PID $($_.Id)"
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

# Rewrite Caddyfile UTF-8 no BOM
$hostLine = $Domain
if ($WwwDomain -and $WwwDomain -ne $Domain) { $hostLine = "$Domain, $WwwDomain" }
$cf = @"
{
	email $Email
}

$hostLine {
	encode gzip
	reverse_proxy 127.0.0.1:$BackendPort
}
"@
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($caddyfile, $cf, $utf8)
Write-Host "`n==> Caddyfile written (UTF-8 no BOM):"
Get-Content $caddyfile | ForEach-Object { Write-Host "  | $_" }

$env:HOME = $caddyDir
$env:XDG_DATA_HOME = $dataDir
$env:XDG_CONFIG_HOME = $configDir

Write-Host "`n==> validate"
Push-Location $caddyDir
try {
  & .\caddy.exe validate --config Caddyfile --adapter caddyfile 2>&1 | ForEach-Object { Write-Host "  $_" }
  Write-Host "  validate exit: $LASTEXITCODE"
} finally {
  Pop-Location
}

Write-Host "`n==> backend :$BackendPort"
try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/health" -UseBasicParsing -TimeoutSec 5
  Write-Host "  health $($h.StatusCode) $($h.Content)"
} catch {
  Write-Host "  WARNING backend down: $_" -ForegroundColor Yellow
  $api = Get-Service mg-api -ErrorAction SilentlyContinue
  if ($api -and $api.Status -ne "Running") {
    Write-Host "  starting mg-api..."
    Start-Service mg-api -ErrorAction SilentlyContinue
    Start-Sleep 4
  }
}

Write-Host "`n==> foreground smoke test (8 sec)"
$smokeLog = Join-Path $caddyDir "smoke-err.log"
if (Test-Path $smokeLog) { Remove-Item $smokeLog -Force }
$p = Start-Process -FilePath $caddyExe `
  -ArgumentList @("run", "--config", "Caddyfile", "--adapter", "caddyfile") `
  -WorkingDirectory $caddyDir `
  -RedirectStandardError $smokeLog `
  -RedirectStandardOutput (Join-Path $caddyDir "smoke-out.log") `
  -PassThru `
  -WindowStyle Hidden
Start-Sleep -Seconds 8
$alive = -not $p.HasExited
Write-Host "  process alive after 8s: $alive (exit=$($p.ExitCode))"
if (Test-Path $smokeLog) {
  Write-Host "  --- smoke-err.log ---"
  Get-Content $smokeLog -Tail 50 | ForEach-Object { Write-Host "  $_" }
}
if ($alive) {
  Write-Host "  smoke OK — stopping test process"
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep 1
} else {
  Write-Host "  smoke FAILED — Caddy exits immediately; fix errors in smoke-err.log above" -ForegroundColor Red
  Write-Host "  Common: port 80 busy, bad Caddyfile, missing caddy.exe deps"
  # still try to reinstall service below so logs are wired
}

Write-Host "`n==> reinstall NSSM service"
& $nssm stop $CaddyService 2>$null | Out-Null
Start-Sleep 1
& $nssm remove $CaddyService confirm 2>$null | Out-Null
Start-Sleep 1

& $nssm install $CaddyService $caddyExe
# IMPORTANT: no nested quotes; AppDirectory + relative Caddyfile
& $nssm set $CaddyService Application $caddyExe
& $nssm set $CaddyService AppDirectory $caddyDir
& $nssm set $CaddyService AppParameters "run --config Caddyfile --adapter caddyfile"
# NSSM wants newline-separated env in ONE value for some versions — use registry-safe form:
$envBlock = "HOME=$caddyDir`0XDG_DATA_HOME=$dataDir`0XDG_CONFIG_HOME=$configDir"
& $nssm set $CaddyService AppEnvironmentExtra HOME=$caddyDir
& $nssm set $CaddyService AppEnvironmentExtra HOME=$caddyDir XDG_DATA_HOME=$dataDir XDG_CONFIG_HOME=$configDir
& $nssm set $CaddyService ObjectName LocalSystem
& $nssm set $CaddyService Start SERVICE_AUTO_START
& $nssm set $CaddyService AppStdout $outLog
& $nssm set $CaddyService AppStderr $errLog
& $nssm set $CaddyService AppRotateFiles 1
& $nssm set $CaddyService AppExit Default Restart
& $nssm set $CaddyService AppRestartDelay 2000
& $nssm set $CaddyService AppThrottle 1500

Write-Host "`n==> nssm dump (key fields)"
& $nssm get $CaddyService Application
& $nssm get $CaddyService AppDirectory
& $nssm get $CaddyService AppParameters
& $nssm get $CaddyService AppEnvironmentExtra

Write-Host "`n==> Start-Service"
Remove-Item $errLog, $outLog -Force -ErrorAction SilentlyContinue
try {
  Start-Service $CaddyService -ErrorAction Stop
} catch {
  Write-Host "Start-Service exception: $_" -ForegroundColor Red
}
Start-Sleep 5
$st = Get-Service $CaddyService
Write-Host "Status: $($st.Status)"

Write-Host "`n==> service logs"
if (Test-Path $errLog) {
  Write-Host "--- caddy-err.log ---"
  Get-Content $errLog -Tail 80
} else {
  Write-Host "(no caddy-err.log)"
}
if (Test-Path $outLog) {
  Write-Host "--- caddy-out.log ---"
  Get-Content $outLog -Tail 40
}

Write-Host "`n==> Event Log Application (last caddy/nssm)"
Get-WinEvent -LogName Application -MaxEvents 30 -ErrorAction SilentlyContinue |
  Where-Object { $_.ProviderName -match 'nssm|Service Control Manager' -or $_.Message -match 'caddy|mg-caddy' } |
  Select-Object -First 8 TimeCreated, Id, ProviderName, @{n='Msg';e={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} |
  Format-List

if ($st.Status -eq "Running") {
  Write-Host "`nOK: mg-caddy is Running" -ForegroundColor Green
  Write-Host "Test: Invoke-WebRequest http://127.0.0.1/ -UseBasicParsing -Headers @{Host='$Domain'}"
  Write-Host "Test: Invoke-WebRequest https://$Domain/health -UseBasicParsing"
} else {
  Write-Host "`nFAILED: paste EVERYTHING above back to chat" -ForegroundColor Red
  Write-Host "Especially smoke-err.log and caddy-err.log sections."
}
