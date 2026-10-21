#!/usr/bin/env bash
# Deploy / update site + public API on VPS. Run as root:
#   sudo bash /opt/mg-group/api/deploy/vps/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mg-group}"
API_DIR="$APP_DIR/api"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# Frontend (static export into out/ — served by FastAPI WEB_ROOT)
if [[ -f "$APP_DIR/package.json" ]]; then
  cd "$APP_DIR"
  # Vercel-style env must NOT be set; we want static export for self-host
  unset VERCEL || true
  # next/typescript live in dependencies; keep full install for build tooling
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
  npm run build
fi

# Python deps
cd "$API_DIR"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt

# Ensure uploads dir
mkdir -p "$API_DIR/data/uploads"
chown -R mg:mg "$APP_DIR" 2>/dev/null || true

systemctl restart mg-api
systemctl --no-pager --full status mg-api | head -n 20

echo "OK: site+API updated. Health: curl -sS http://127.0.0.1:8080/api/v1/health || true"
