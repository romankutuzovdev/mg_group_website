@echo off
REM Start ONE Google Chrome with remote debugging for MG.GROUP scrapers.
REM All agents (Copart / IAAI / Copart UK / Manheim / SalvageMarket) attach
REM to this Chrome and open separate tabs in the same window.

set PORT=9223
set PROFILE=%LOCALAPPDATA%\mg-group-chrome-scraper

if not exist "%PROFILE%" mkdir "%PROFILE%"

REM Prefer installed Google Chrome
set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe

if "%CHROME%"=="" (
  echo Google Chrome not found. Install Chrome and re-run.
  exit /b 1
)

echo Starting Chrome on CDP port %PORT% ...
echo Profile: %PROFILE%
echo Then set in api\.env:
echo   SCRAPER_CDP_URL=http://127.0.0.1:%PORT%
echo   SCRAPER_HEADLESS=false
echo Log into IAAI / Manheim / Copart UK in this Chrome if challenged, then start the API.

start "" "%CHROME%" ^
  --remote-debugging-port=%PORT% ^
  --user-data-dir="%PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  about:blank

echo Chrome started. Leave this window open while scrapers run.
