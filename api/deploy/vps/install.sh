#!/usr/bin/env bash
# First-time VPS setup (Ubuntu 22.04/24.04). Run as root:
#   curl -fsSL ... | bash   OR
#   sudo bash api/deploy/vps/install.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mg-group}"
REPO_URL="${REPO_URL:-https://github.com/romankutuzovdev/mg_group_website.git}"
BRANCH="${BRANCH:-main}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates build-essential python3 python3-venv python3-pip \
  debian-keyring debian-archive-keyring apt-transport-https

# Node 20
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Caddy
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

id -u mg >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin mg

if [[ ! -d "$APP_DIR/.git" ]]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R mg:mg "$APP_DIR"

API_DIR="$APP_DIR/api"
sudo -u mg python3 -m venv "$API_DIR/.venv"
sudo -u mg "$API_DIR/.venv/bin/pip" install -U pip
sudo -u mg "$API_DIR/.venv/bin/pip" install -r "$API_DIR/requirements.txt"

mkdir -p "$API_DIR/data/uploads" /var/log/caddy
chown -R mg:mg "$API_DIR/data"

if [[ ! -f "$API_DIR/.env" ]]; then
  cp "$API_DIR/deploy/vps/env.public.example" "$API_DIR/.env"
  echo "==> Edit $API_DIR/.env (LOTS_SOURCE_URL, INGEST_API_KEY, JWT, Telegram)"
fi

cp "$API_DIR/deploy/vps/mg-api.service" /etc/systemd/system/mg-api.service
systemctl daemon-reload
systemctl enable mg-api

if [[ ! -f /etc/caddy/Caddyfile ]] || ! grep -q "mg-group" /etc/caddy/Caddyfile 2>/dev/null; then
  cp "$API_DIR/deploy/vps/Caddyfile.example" /etc/caddy/Caddyfile
  echo "==> Wrote /etc/caddy/Caddyfile — edit domain, then: systemctl reload caddy"
fi

echo ""
echo "Next:"
echo "  1) nano $API_DIR/.env"
echo "  2) nano /etc/caddy/Caddyfile   # domain → this VPS"
echo "  3) DNS A record → VPS IP"
echo "  4) sudo bash $API_DIR/deploy/vps/update.sh"
echo "  5) On Windows: APP_ROLE=scraper + same INGEST_API_KEY (see VPS-SPLIT.md)"
