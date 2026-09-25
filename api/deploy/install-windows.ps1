# Установка из уже склонированного репозитория.
# Полная установка с нуля: api\deploy\setup-windows.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
# api\deploy → repo root
$repoRoot = (Resolve-Path (Join-Path $here "..\..")).Path
& (Join-Path $here "setup-windows.ps1") -AppDir $repoRoot
