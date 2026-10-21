# Build cabinet-backup.zip on Windows (cabinet.db + uploads).
# Run on the scraper box:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\export-cabinet-backup.ps1
param(
  [string]$ApiRoot = "C:\mg-api\api",
  [string]$OutFile = "C:\mg-api\cabinet-backup.zip"
)

$ErrorActionPreference = "Stop"
$data = Join-Path $ApiRoot "data"
$db = Join-Path $data "cabinet.db"
$uploads = Join-Path $data "uploads"

if (-not (Test-Path $db)) {
  throw "cabinet.db not found: $db"
}

# Prefer live API export (WAL checkpoint + consistent zip)
$envPath = Join-Path $ApiRoot ".env"
$key = ""
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*INGEST_API_KEY=(.+)$') { $key = $Matches[1].Trim() }
  }
}

try {
  $headers = @{}
  if ($key) { $headers["X-API-Key"] = $key }
  Invoke-WebRequest -Uri "http://127.0.0.1/api/v1/internal/cabinet-backup" `
    -Headers $headers -OutFile $OutFile -TimeoutSec 600
  Write-Host "OK (via API): $OutFile ($((Get-Item $OutFile).Length) bytes)"
  exit 0
} catch {
  Write-Warning "API export failed ($($_.Exception.Message)) — packing files directly"
}

if (Test-Path $OutFile) { Remove-Item -Force $OutFile }
Compress-Archive -Path $db, $uploads -DestinationPath $OutFile -Force
Write-Host "OK (direct zip): $OutFile ($((Get-Item $OutFile).Length) bytes)"
Write-Host "Copy to VPS: scp $OutFile root@VPS:/tmp/ && unzip there into /opt/mg-group/api/data/"
