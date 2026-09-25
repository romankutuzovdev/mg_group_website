@echo off
REM Скачать открытый репозиторий в C:\mg-api
REM Запуск: download-repo.bat
REM Или с установкой: download-repo.bat -Install

setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0download-repo.ps1" %*
endlocal
