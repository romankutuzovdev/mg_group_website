# Download / update public mg_group_website repo (no login for public repos).
#
#   powershell -ExecutionPolicy Bypass -File .\download-repo.ps1
#   powershell -ExecutionPolicy Bypass -File .\download-repo.ps1 -AppDir C:\mg-api -Install
#
param(
  [string]$RepoUrl = "https://github.com/romankutuzovdev/mg_group_website.git",
  [string]$AppDir = "C:\mg-api",
  [string]$Branch = "main",
  [switch]$Install
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Assert-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing: $Name. $Hint"
  }
}

Write-Host "==> Repo:   $RepoUrl" -ForegroundColor Cyan
Write-Host "==> AppDir: $AppDir"
Write-Host "==> Branch: $Branch"

Assert-Command git "Install Git: https://git-scm.com/download/win"

$gitDir = Join-Path $AppDir ".git"

if (Test-Path $gitDir) {
  Write-Host "==> Existing clone - updating..."
  Set-Location $AppDir
  git remote set-url origin $RepoUrl
  git fetch --all --prune
  git checkout $Branch
  git reset --hard "origin/$Branch"
} elseif (Test-Path $AppDir) {
  $items = Get-ChildItem -Force $AppDir -ErrorAction SilentlyContinue
  if ($items -and $items.Count -gt 0) {
    throw "Folder $AppDir exists and is not empty (and not a git repo). Use another -AppDir or delete it."
  }
  Write-Host "==> Cloning into empty folder..."
  git clone --branch $Branch --single-branch $RepoUrl $AppDir
} else {
  $parent = Split-Path $AppDir -Parent
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  Write-Host "==> Cloning..."
  git clone --branch $Branch --single-branch $RepoUrl $AppDir
}

Write-Host ""
Write-Host "Done: $AppDir" -ForegroundColor Green
git -C $AppDir log -1 --oneline

if ($Install) {
  $installScript = Join-Path $AppDir "api\deploy\install-windows.ps1"
  if (-not (Test-Path $installScript)) {
    throw "Not found: $installScript"
  }
  Write-Host "==> Running install..." -ForegroundColor Cyan
  & $installScript
} else {
  Write-Host ""
  Write-Host "Next (as Administrator):"
  Write-Host "  powershell -ExecutionPolicy Bypass -File $AppDir\api\deploy\install-windows.ps1"
}
