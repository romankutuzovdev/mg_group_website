# Enable Windows → VPS catalog push (fixes empty catalog on mg-group.by).
# Run on Windows as Admin:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\enable-lots-push.ps1
#
# Optional:
#   -VpsIngestUrl http://178.172.138.96/api/v1/internal/lots-ingest
#   -IngestKey "same-as-VPS-INGEST_API_KEY"

param(
  [string]$AppDir = "C:\mg-api",
  [string]$VpsIngestUrl = "http://178.172.138.96/api/v1/internal/lots-ingest",
  [string]$IngestKey = "",
  [string]$ServiceName = "mg-api"
)

$ErrorActionPreference = "Stop"
$envPath = Join-Path $AppDir "api\.env"
if (-not (Test-Path $envPath)) { throw "Missing $envPath" }

$raw = Get-Content -Raw -Path $envPath
if (-not $IngestKey) {
  if ($raw -match '(?m)^INGEST_API_KEY=(.+)$') {
    $IngestKey = $Matches[1].Trim().Trim('"')
  }
}
if (-not $IngestKey) {
  throw "Pass -IngestKey or set INGEST_API_KEY in api\.env (must match VPS)"
}

function Set-EnvLine([string]$text, [string]$key, [string]$value) {
  $line = "$key=$value"
  if ($text -match "(?m)^$key=.*$") {
    return [regex]::Replace($text, "(?m)^$key=.*$", $line)
  }
  return ($text.TrimEnd() + "`r`n$line`r`n")
}

$next = $raw
$next = Set-EnvLine $next "APP_ROLE" "scraper"
$next = Set-EnvLine $next "LOTS_PUSH_URL" $VpsIngestUrl
$next = Set-EnvLine $next "LOTS_PUSH_API_KEY" $IngestKey
$next = Set-EnvLine $next "LOTS_PUSH_INTERVAL_SECONDS" "180"
$next = Set-EnvLine $next "PUBLIC_SITE_URL" "http://178.172.138.96"
$next = Set-EnvLine $next "REDIRECT_APEX_TO_VERCEL" "false"
if ($next -notmatch '(?m)^INGEST_API_KEY=') {
  $next = Set-EnvLine $next "INGEST_API_KEY" $IngestKey
}

Copy-Item $envPath "$envPath.bak-$(Get-Date -Format yyyyMMdd-HHmmss)" -Force
Set-Content -Path $envPath -Value $next -Encoding UTF8
Write-Host "Updated $envPath"

Restart-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4
try {
  $h = Invoke-RestMethod "http://127.0.0.1/health"
  Write-Host "Health: lots=$($h.lots) status=$($h.status)"
} catch {
  Write-Host "Health check failed: $_"
}

Write-Host "Force one push…"
try {
  $headers = @{ "X-API-Key" = $IngestKey }
  $r = Invoke-RestMethod -Method Post -Headers $headers `
    -Uri "http://127.0.0.1/api/v1/internal/lots-sync-now"
  Write-Host ($r | ConvertTo-Json -Compress)
} catch {
  Write-Host "Push failed (check VPS INGEST_API_KEY / firewall): $_"
  Write-Host "Status:"
  Invoke-RestMethod "http://127.0.0.1/api/v1/internal/lots-sync-status" | ConvertTo-Json
}

Write-Host "Done. Site catalog: https://www.mg-group.by/health"
