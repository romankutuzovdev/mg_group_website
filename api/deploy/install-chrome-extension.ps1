# Install an UNPACKED Chrome extension into the scraper profile.
# Chrome with --remote-debugging-port often blocks Chrome Web Store installs.
# Use this instead: download .crx/.zip or clone extension folder, then:
#
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\install-chrome-extension.ps1 `
#     -Source "C:\path\to\extension-folder" -Name my-ext
#
# Or pass a zip:
#   ... -Source "C:\Downloads\ext.zip" -Name my-ext
#
# Then restart headed Chrome:
#   powershell -ExecutionPolicy Bypass -File C:\mg-api\api\deploy\start-headed-chrome.ps1

param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [string]$Name = "",
  [string]$AppDir = "C:\mg-api"
)

$ErrorActionPreference = "Stop"
$apiDir = Join-Path $AppDir "api"
$extRoot = Join-Path $apiDir "data\chrome-extensions"
$profileDir = Join-Path $apiDir "data\chrome-profile"
New-Item -ItemType Directory -Force -Path $extRoot | Out-Null

if (-not (Test-Path $Source)) {
  throw "Source not found: $Source"
}

$srcItem = Get-Item $Source
if (-not $Name) {
  $Name = [regex]::Replace($srcItem.BaseName, "[^a-zA-Z0-9_-]", "-").ToLower()
}
if (-not $Name) { $Name = "ext-$(Get-Random -Maximum 9999)" }

$dest = Join-Path $extRoot $Name
if (Test-Path $dest) {
  Remove-Item $dest -Recurse -Force
}

$tmp = Join-Path $env:TEMP "mg-chrome-ext-$Name"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }

if ($srcItem.PSIsContainer) {
  Copy-Item $Source $dest -Recurse
} elseif ($srcItem.Extension -match '\.(zip|crx)$') {
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  # .crx is a zip with a header - try Expand-Archive; if fail, strip CRX header
  $zipPath = Join-Path $tmp "ext.zip"
  if ($srcItem.Extension -eq ".crx") {
    $bytes = [IO.File]::ReadAllBytes($srcItem.FullName)
    # CRX3: find PK zip local header
    $pk = -1
    for ($i = 0; $i -lt [Math]::Min($bytes.Length - 4, 2048); $i++) {
      if ($bytes[$i] -eq 0x50 -and $bytes[$i+1] -eq 0x4B -and $bytes[$i+2] -eq 0x03 -and $bytes[$i+3] -eq 0x04) {
        $pk = $i; break
      }
    }
    if ($pk -lt 0) { throw "Cannot find zip payload inside .crx" }
    $zipBytes = New-Object byte[] ($bytes.Length - $pk)
    [Array]::Copy($bytes, $pk, $zipBytes, 0, $zipBytes.Length)
    [IO.File]::WriteAllBytes($zipPath, $zipBytes)
  } else {
    Copy-Item $Source $zipPath -Force
  }
  Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
  $manifest = Get-ChildItem -Path $tmp -Recurse -Filter manifest.json |
    Where-Object { $_.FullName -notmatch '\\_metadata\\' } |
    Select-Object -First 1
  if (-not $manifest) { throw "No manifest.json in archive" }
  $root = $manifest.Directory.FullName
  Copy-Item $root $dest -Recurse
} else {
  throw "Source must be a folder, .zip, or .crx"
}

$manifestPath = Join-Path $dest "manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "Installed folder missing manifest.json: $dest"
}

Write-Host "Installed unpacked extension: $dest"
Write-Host "==> stop Chrome on CDP port, then start headed with --load-extension"
try { Stop-Service mg-chrome-cdp -Force -ErrorAction SilentlyContinue } catch {}
Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
    if ($cmd -and $cmd -match 'remote-debugging-port=9223|chrome-profile') {
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}
Start-Sleep -Seconds 2

# clear locks
foreach ($lockName in @("SingletonLock", "SingletonCookie", "SingletonSocket")) {
  $p = Join-Path $profileDir $lockName
  if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
}

$start = Join-Path $apiDir "deploy\start-headed-chrome.ps1"
if (Test-Path $start) {
  powershell -ExecutionPolicy Bypass -File $start -AppDir $AppDir -SkipApiRestart
} else {
  $watchdog = Join-Path $apiDir "scripts\chrome-cdp-watchdog.ps1"
  $psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  Start-Process $psExe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$watchdog`" -Port 9223 -ProfileDir `"$profileDir`" -Headless 0" -WorkingDirectory $apiDir
}

Write-Host ""
Write-Host "In Chrome open chrome://extensions - extension should be loaded."
Write-Host "Web Store 'Add' often stays blocked under CDP - always use this script for new addons."
