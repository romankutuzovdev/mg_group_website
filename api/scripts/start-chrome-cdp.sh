#!/usr/bin/env bash
# Start ONE Google Chrome with remote debugging for MG.GROUP scrapers.
# All agents (Copart / IAAI / Copart UK / Manheim / SalvageMarket / Encar)
# attach to this Chrome and open separate tabs in the same window.

set -euo pipefail

PORT="${SCRAPER_CDP_PORT:-9223}"
PROFILE="${HOME}/Library/Application Support/mg-group-chrome-scraper"

mkdir -p "$PROFILE"

CHROME=""
for candidate in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
do
  if [[ -x "$candidate" ]]; then
    CHROME="$candidate"
    break
  fi
done

if [[ -z "$CHROME" ]]; then
  echo "Google Chrome not found. Install Chrome and re-run."
  exit 1
fi

echo "Starting Chrome on CDP port ${PORT} ..."
echo "Profile: ${PROFILE}"
echo "Then set in api/.env:"
echo "  SCRAPER_CDP_URL=http://127.0.0.1:${PORT}"
echo "  SCRAPER_HEADLESS=false"
echo "Log into IAAI / Manheim / Copart UK in this Chrome if challenged, then start the API."

"$CHROME" \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${PROFILE}" \
  --no-first-run \
  --no-default-browser-check \
  about:blank >/dev/null 2>&1 &

echo "Chrome started (pid $!). Leave it open while scrapers run."
