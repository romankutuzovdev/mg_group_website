# Why is Bid.cars not scraping? One-shot diagnostics, run on the Windows server
# in your desktop (AnyDesk/RDP) session, then paste the whole output:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\diagnose-bidcars.ps1
#
# Prints: service, API health, scraper + bidcars agent status, Chrome CDP tabs and
# which Windows session Chrome lives in, external IP/country, Bid.cars reachability,
# VPN adapters, scraper keys from .env (secrets are never printed).

param(
  [string]$AppDir = "C:\mg-api",
  [int]$CdpPort = 9223
)

$ErrorActionPreference = "Continue"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$apiDir = Join-Path $AppDir "api"
$Port = if ($env:API_PORT) { [int]$env:API_PORT } else { 80 }
if ((Test-Path (Join-Path $apiDir "deploy\.behind-caddy")) -and -not $env:API_PORT) { $Port = 8080 }
$base = "http://127.0.0.1:$Port"

function Section([string]$title) { Write-Host ""; Write-Host "==> $title" -ForegroundColor Cyan }
function Get-Json([string]$url, [int]$timeout = 15) {
  try { return Invoke-RestMethod -Uri $url -TimeoutSec $timeout } catch { Write-Host "  FAIL $url : $($_.Exception.Message)" -ForegroundColor Red; return $null }
}

Section "1. Service mg-api"
try { Get-Service mg-api | Format-Table Name, Status, StartType -AutoSize } catch { Write-Host "  no service mg-api: $_" -ForegroundColor Red }
try { Get-Service mg-chrome-cdp -ErrorAction Stop | Format-Table Name, Status, StartType -AutoSize } catch { Write-Host "  (no mg-chrome-cdp service - fine for headed mode)" }

Section "2. API health ($base)"
$h = Get-Json "$base/health"
if ($h) { Write-Host "  status=$($h.status) lots=$($h.lots)" }

Section "3. Scraper status"
$s = Get-Json "$base/api/v1/scraper/status"
if ($s) {
  $s | Select-Object running, enabled, browser_mode, cycles, last_error, sources, cdp_url | Format-List
  Write-Host "  --- agents.bidcars ---"
  if ($s.agents.bidcars) { $s.agents.bidcars | Format-List } else { Write-Host "  bidcars agent MISSING (scraper never started / not in SCRAPER_SOURCES)" -ForegroundColor Yellow }
  Write-Host "  --- other agents (name running cycles last_error last_blocked tab_open) ---"
  foreach ($p in $s.agents.PSObject.Properties) {
    $a = $p.Value
    Write-Host ("  {0,-15} running={1} cycles={2} err={3} blocked={4} tab={5}" -f $p.Name, $a.running, $a.cycles, $a.last_error, $a.last_blocked, $a.tab_open)
  }
}

Section "4. Lots push Windows -> VPS"
$sync = Get-Json "$base/api/v1/internal/lots-sync-status"
if ($sync) { $sync | Select-Object app_role, mode, running, lots_push_url, last_ok_at, last_error, last_count | Format-List }

Section "5. Chrome CDP on $CdpPort"
$v = Get-Json "http://127.0.0.1:$CdpPort/json/version" 5
if ($v) {
  Write-Host "  $($v.Browser)  UA=$($v.'User-Agent')"
  $tabs = Get-Json "http://127.0.0.1:$CdpPort/json/list" 5
  if ($tabs) {
    Write-Host "  tabs: $(@($tabs).Count)"
    foreach ($t in $tabs) { if ($t.type -eq "page") { Write-Host ("   - {0,-40} {1}" -f ($t.title.Substring(0, [Math]::Min(40, $t.title.Length))), $t.url.Substring(0, [Math]::Min(90, $t.url.Length))) } }
    $bid = @($tabs | Where-Object { $_.url -match "bid\.cars" })
    if ($bid.Count -eq 0) { Write-Host "  NO bid.cars tab in CDP Chrome" -ForegroundColor Yellow }
  }
} else {
  Write-Host "  CDP DOWN - scraper cannot attach. Start: deploy\start-headed-chrome.ps1 (in your desktop session)" -ForegroundColor Red
}

Section "6. Chrome processes vs your session"
$mySession = (Get-Process -Id $PID).SessionId
Write-Host "  this PowerShell SessionId=$mySession"
$chrome = @(Get-Process chrome -ErrorAction SilentlyContinue)
if ($chrome.Count -eq 0) { Write-Host "  no chrome.exe running" -ForegroundColor Yellow }
else {
  $chrome | Group-Object SessionId | ForEach-Object { Write-Host "  chrome.exe x$($_.Count) in SessionId=$($_.Name)" }
  $cdpProc = $chrome | Where-Object { try { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match "remote-debugging-port=$CdpPort" } catch { $false } } | Select-Object -First 1
  if ($cdpProc) {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($cdpProc.Id)").CommandLine
    Write-Host "  CDP chrome PID=$($cdpProc.Id) SessionId=$($cdpProc.SessionId)"
    if ($cdpProc.SessionId -ne $mySession) { Write-Host "  CDP Chrome is in ANOTHER session -> invisible to you (started from SSH/Session 0)" -ForegroundColor Yellow }
    if ($cl -match "--headless") { Write-Host "  CDP Chrome runs HEADLESS -> Cloudflare click impossible" -ForegroundColor Yellow }
    $ud = [regex]::Match($cl, '--user-data-dir="?([^" ]+)').Groups[1].Value
    if ($ud) { Write-Host "  profile: $ud" }
  } else { Write-Host "  no chrome.exe with --remote-debugging-port=$CdpPort" -ForegroundColor Yellow }
}
try { query session 2>$null | ForEach-Object { Write-Host "  $_" } } catch {}

Section "7. External IP / VPN"
try {
  $ip = Invoke-RestMethod "https://ipinfo.io/json" -TimeoutSec 15
  Write-Host "  ip=$($ip.ip) country=$($ip.country) org=$($ip.org)"
  if ($ip.country -eq "BY") { Write-Host "  country=BY -> VPN is OFF (Bid.cars Cloudflare blocks/challenges BY addresses)" -ForegroundColor Yellow }
} catch { Write-Host "  ipinfo failed: $($_.Exception.Message)" -ForegroundColor Red }
try {
  Get-NetAdapter | Where-Object { $_.InterfaceDescription -match "VPN|TAP|TUN|Wintun|WireGuard|OpenVPN|Nord|Proton|Surfshark|Express" -or $_.Name -match "VPN|TAP|TUN|WireGuard" } |
    Format-Table Name, InterfaceDescription, Status -AutoSize
} catch {}

Section "8. Bid.cars from this server (plain HTTP, no browser)"
foreach ($u in @("https://bid.cars/", "https://bid.cars/en/search/results?search-type=filters&status=All&type=Automobile")) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 20 -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36"
    Write-Host "  $($r.StatusCode) $u"
  } catch {
    $code = $null; try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    $mit = $null; try { $mit = $_.Exception.Response.Headers["cf-mitigated"] } catch {}
    if ($code) { Write-Host "  $code cf-mitigated=$mit $u  (403+challenge = Cloudflare check, normal; needs click in Chrome)" }
    else { Write-Host "  NO CONNECTION $u : $($_.Exception.Message)" -ForegroundColor Red }
  }
}

Section "9. VPS reachable from here (push target)"
try { $vh = Invoke-RestMethod "http://178.172.138.96/health" -TimeoutSec 15; Write-Host "  VPS health lots=$($vh.lots)" } catch { Write-Host "  VPS unreachable: $($_.Exception.Message)" -ForegroundColor Red }

Section "10. Scraper keys in api\.env (values of secrets hidden)"
$envFile = Join-Path $apiDir ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | Where-Object { $_ -match "^(APP_ROLE|SCRAPER_[A-Z_]+|LOTS_PUSH_URL|LOTS_PUSH_INTERVAL_SECONDS|PUBLIC_SITE_URL|R2_ENABLED|R2_BUCKET|R2_PUBLIC_BASE_URL|CALC_CHROME[A-Z_]*)=" } |
    ForEach-Object { if ($_ -match "KEY|TOKEN|SECRET|PASS") { ($_ -replace "=.*", "=<hidden>") } else { $_ } } | ForEach-Object { Write-Host "  $_" }
} else { Write-Host "  $envFile not found" -ForegroundColor Red }

Section "11. Last service log lines"
$logs = @()
try { $nssm = Join-Path $apiDir "deploy\nssm.exe"; if (Test-Path $nssm) { $logs += (& $nssm get mg-api AppStdout 2>$null); $logs += (& $nssm get mg-api AppStderr 2>$null) } } catch {}
$logs += Get-ChildItem (Join-Path $apiDir "logs"), (Join-Path $AppDir "logs") -Filter *.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 2 -ExpandProperty FullName
foreach ($lf in ($logs | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique)) {
  Write-Host "  --- $lf ---"
  Get-Content $lf -Tail 40 | Where-Object { $_ -match "bidcars|Cloudflare|CDP|blocked|lots push|agent|Chrome" } | Select-Object -Last 25 | ForEach-Object { Write-Host "  $_" }
}
if (-not $logs) { Write-Host "  no log files found (check NSSM AppStdout setting)" }

Write-Host ""
Write-Host "Done. Copy everything above." -ForegroundColor Green
