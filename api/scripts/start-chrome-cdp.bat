@echo off
REM Start ONE Google Chrome with remote debugging for MG.GROUP scrapers.
REM Under Windows Service / NSSM use headless (set MG_CHROME_HEADLESS=1, default on).
REM Agents reuse labeled tabs after API restart.

set PORT=9223
set PROFILE=%~dp0..\data\chrome-profile
if not exist "%PROFILE%" mkdir "%PROFILE%"

set HEADLESS=0
if /I "%MG_CHROME_HEADLESS%"=="1" set HEADLESS=1
if /I "%MG_CHROME_HEADLESS%"=="true" set HEADLESS=1

set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe

if "%CHROME%"=="" (
  echo Google Chrome not found. Install Chrome and re-run.
  exit /b 1
)

curl -s -m 2 "http://127.0.0.1:%PORT%/json/version" >nul 2>&1
if not errorlevel 1 (
  echo Chrome CDP already running on port %PORT%.
  exit /b 0
)

echo Starting Chrome CDP port %PORT% headless=%HEADLESS%
echo Profile: %PROFILE%

if "%HEADLESS%"=="1" (
  start "" "%CHROME%" ^
    --headless=new ^
    --disable-gpu ^
    --window-size=1920,1080 ^
    --no-sandbox ^
    --remote-debugging-port=%PORT% ^
    --remote-allow-origins=* ^
    --user-data-dir="%PROFILE%" ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-dev-shm-usage ^
    about:blank
) else (
  start "" "%CHROME%" ^
    --remote-debugging-port=%PORT% ^
    --remote-allow-origins=* ^
    --user-data-dir="%PROFILE%" ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-dev-shm-usage ^
    about:blank
)

echo Chrome started. API will attach via SCRAPER_CDP_URL=http://127.0.0.1:%PORT%
