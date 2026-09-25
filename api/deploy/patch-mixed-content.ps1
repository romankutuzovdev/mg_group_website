# Emergency: strip hardcoded http://91.149.133.54 from static export (Mixed Content fix).
# Run on Windows after any old build, before or instead of full rebuild:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\patch-mixed-content.ps1

param(
  [string]$AppDir = "C:\mg-api"
)

$ErrorActionPreference = "Stop"
$outDir = Join-Path $AppDir "out"
if (-not (Test-Path $outDir)) {
  throw "Missing $outDir - build the site first"
}

$needles = @(
  "http://91.149.133.54",
  "http://91.149.133.54.nip.io",
  "https://91.149.133.54"
)
$files = Get-ChildItem -Path $outDir -Recurse -Include *.js,*.html,*.css,*.json,*.txt -File
$changed = 0
foreach ($f in $files) {
  $raw = [System.IO.File]::ReadAllText($f.FullName)
  $next = $raw
  foreach ($n in $needles) {
    $next = $next.Replace($n, "")
  }
  if ($next -ne $raw) {
    [System.IO.File]::WriteAllText($f.FullName, $next)
    $changed++
    Write-Host "patched $($f.FullName.Substring($outDir.Length))"
  }
}

Write-Host "Patched $changed file(s). Restarting mg-api..."
try {
  Restart-Service -Name mg-api -Force -ErrorAction Stop
} catch {
  Write-Host "Restart failed: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Hard-refresh the browser (Ctrl+Shift+R) on https://mg-group.by/cabinet/"
Write-Host "Network tab must show: https://mg-group.by/api/v1/...  (NOT http://91.149...)"
