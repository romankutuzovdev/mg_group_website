#!/usr/bin/env bash
# Pull cabinet.db + uploads from Windows onto this VPS, then restart API.
# Usage (on VPS, as root):
#   sudo bash /opt/mg-group/api/deploy/vps/pull-cabinet.sh
# Or with explicit URL:
#   CABINET_SOURCE_URL=http://91.149.133.54/api/v1/internal/cabinet-backup \
#   INGEST_API_KEY=secret sudo -E bash pull-cabinet.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mg-group}"
API_DIR="$APP_DIR/api"
ENV_FILE="${ENV_FILE:-$API_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # strip CRLF / comments lightly
  source <(grep -E '^(CABINET_SOURCE_URL|CABINET_SOURCE_API_KEY|LOTS_SOURCE_API_KEY|INGEST_API_KEY|CABINET_DB_PATH|CABINET_UPLOADS_DIR)=' "$ENV_FILE" | tr -d '\r')
  set +a
fi

URL="${CABINET_SOURCE_URL:-http://91.149.133.54/api/v1/internal/cabinet-backup}"
KEY="${CABINET_SOURCE_API_KEY:-${LOTS_SOURCE_API_KEY:-${INGEST_API_KEY:-}}}"
DB_PATH="${CABINET_DB_PATH:-$API_DIR/data/cabinet.db}"
UPLOADS="${CABINET_UPLOADS_DIR:-$API_DIR/data/uploads}"
DATA_DIR="$(dirname "$DB_PATH")"

mkdir -p "$DATA_DIR" "$UPLOADS"
TMP="$(mktemp -d /tmp/mg-cab-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading cabinet backup from $URL …"
HDR=()
if [[ -n "$KEY" ]]; then
  HDR=(-H "X-API-Key: $KEY")
fi
curl -fsSL "${HDR[@]}" -o "$TMP/cabinet-backup.zip" "$URL"
python3 - <<PY
import zipfile, shutil, os
from pathlib import Path
from datetime import datetime, timezone

zip_path = Path("$TMP/cabinet-backup.zip")
db = Path("$DB_PATH")
uploads = Path("$UPLOADS")
db.parent.mkdir(parents=True, exist_ok=True)
uploads.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(zip_path) as zf:
    zf.extractall("$TMP/out")

src = Path("$TMP/out/cabinet.db")
if not src.is_file():
    raise SystemExit("cabinet.db missing in backup zip")

if db.is_file():
    bak = db.with_suffix(".db.bak-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"))
    shutil.copy2(db, bak)
    print("backed up existing DB →", bak)

for side in (Path(str(db) + "-wal"), Path(str(db) + "-shm")):
    if side.exists():
        side.unlink()

shutil.copy2(src, db)
print("wrote", db, db.stat().st_size, "bytes")

src_up = Path("$TMP/out/uploads")
n = 0
if src_up.is_dir():
    for p in src_up.rglob("*"):
        if p.is_file():
            rel = p.relative_to(src_up)
            dest = uploads / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest)
            n += 1
print("uploads files:", n)
PY

chown -R mg:mg "$DATA_DIR" 2>/dev/null || true
systemctl restart mg-api
echo "OK: cabinet on hoster. Status:"
systemctl --no-pager --full status mg-api | head -n 12
