#!/usr/bin/env bash
# Start ONE Google Chrome with remote debugging for MG.GROUP scrapers.
# Agents reuse labeled tabs (title "MG · <agent>") after API restart — no duplicates.

set -euo pipefail

PORT="${SCRAPER_CDP_PORT:-9223}"
PROFILE="${SCRAPER_CHROME_USER_DATA:-${HOME}/Library/Application Support/mg-group-chrome-scraper}"

mkdir -p "$PROFILE"

CHROME=""
for candidate in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/usr/bin/google-chrome" \
  "/usr/bin/chromium-browser"
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

if curl -sf -m 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "Chrome CDP already running on port ${PORT}."
  exit 0
fi

echo "Starting Chrome on CDP port ${PORT} ..."
echo "Profile: ${PROFILE}"
echo "Then set in api/.env:"
echo "  SCRAPER_CDP_URL=http://127.0.0.1:${PORT}"
echo "  SCRAPER_CDP_AUTOSTART=true"
echo "  SCRAPER_HEADLESS=false"

"$CHROME" \
  --remote-debugging-port="${PORT}" \
  --remote-allow-origins="*" \
  --user-data-dir="${PROFILE}" \
  --no-first-run \
  --no-default-browser-check \
  --disable-dev-shm-usage \
  about:blank >/dev/null 2>&1 &

echo "Chrome started (pid $!). Leave it open while scrapers run."
