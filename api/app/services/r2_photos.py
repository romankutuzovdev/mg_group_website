"""Cloudflare R2 CDN for USA/UK lot photos (free-tier friendly).

Flow:
  1) Scraper archives JPEGs on Windows disk (`/api/lot-photos/...`)
  2) For region usa/uk we upload the folder to R2
  3) Lot JSON stores public CDN URLs → browser hits CDN, not Windows
  4) When auction ends, prune deletes disk + R2 prefix

Env (api/.env):
  R2_ENABLED=true
  R2_ACCOUNT_ID=...
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET=mg-lot-photos
  R2_PUBLIC_BASE_URL=https://pub-XXXX.r2.dev
  # or custom: https://img.mg-group.by
"""

from __future__ import annotations

import logging
import mimetypes
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings

logger = logging.getLogger("mg.r2_photos")

# Only USA + England auction photos go to CDN.
CDN_REGIONS = frozenset({"usa", "uk"})
_KEY_PREFIX = "lots"


def _looks_like_s3_api_endpoint(url: str) -> bool:
    """Private S3 API host — browsers cannot load photos from it without signing."""
    u = (url or "").lower()
    return "r2.cloudflarestorage.com" in u and ".r2.dev" not in u


def r2_enabled() -> bool:
    s = get_settings()
    if not getattr(s, "r2_enabled", False):
        return False
    base = (s.r2_public_base_url or "").strip()
    if _looks_like_s3_api_endpoint(base):
        logger.error(
            "R2_PUBLIC_BASE_URL is the S3 API endpoint (%s) — browsers cannot "
            "use it. Enable Public Development URL (pub-….r2.dev) or a custom "
            "domain on the bucket, then set R2_PUBLIC_BASE_URL to that.",
            base[:80],
        )
        return False
    return bool(
        (s.r2_account_id or "").strip()
        and (s.r2_access_key_id or "").strip()
        and (s.r2_secret_access_key or "").strip()
        and (s.r2_bucket or "").strip()
        and base
    )


def region_uses_cdn(region: str | None, source: str | None = None) -> bool:
    """Only USA + England (UK) catalogs."""
    r = (region or "").strip().lower()
    if r in CDN_REGIONS:
        return True
    return (source or "").strip().lower() == "copart_uk"


def public_base() -> str:
    return (get_settings().r2_public_base_url or "").strip().rstrip("/")


def is_cdn_photo(url: str) -> bool:
    u = (url or "").strip()
    if not u.startswith("http"):
        return False
    base = public_base()
    if base and u.startswith(base + "/"):
        return True
    # Custom domain or r2.dev public URL (never the private S3 API host)
    if _looks_like_s3_api_endpoint(u):
        return False
    return f"/{_KEY_PREFIX}/" in u and ".r2.dev/" in u


def object_key(lot_id: str, filename: str) -> str:
    from app.services.lot_photos import safe_lot_id

    name = Path(filename).name
    return f"{_KEY_PREFIX}/{safe_lot_id(lot_id)}/{name}"


def public_url(lot_id: str, filename: str) -> str:
    return f"{public_base()}/{object_key(lot_id, filename)}"


def local_api_to_cdn_url(url: str) -> str | None:
    """`/api/lot-photos/{id}/{file}` → CDN URL, or None if not local."""
    from app.services.lot_photos import is_local_photo

    u = (url or "").strip()
    if not is_local_photo(u):
        return None
    # /api/lot-photos/{lot_id}/{filename}
    parts = u.strip("/").split("/")
    if len(parts) < 4:
        return None
    lot_id, filename = parts[2], parts[3]
    if not lot_id or not filename or not r2_enabled():
        return None
    return public_url(lot_id, filename)


@lru_cache(maxsize=1)
def _client() -> Any | None:
    if not r2_enabled():
        return None
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        logger.warning("boto3 not installed — R2 CDN disabled")
        return None

    s = get_settings()
    endpoint = f"https://{s.r2_account_id.strip()}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=s.r2_access_key_id.strip(),
        aws_secret_access_key=s.r2_secret_access_key.strip(),
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )


def clear_client_cache() -> None:
    _client.cache_clear()


def upload_lot_dir(lot_id: str) -> int:
    """Upload all files in the local lot photo folder to R2. Returns uploaded count."""
    if not r2_enabled():
        return 0
    from app.services.lot_photos import lot_dir, safe_lot_id

    client = _client()
    if client is None:
        return 0
    folder = lot_dir(lot_id)
    if not folder.is_dir():
        return 0
    bucket = get_settings().r2_bucket.strip()
    uploaded = 0
    for path in sorted(folder.iterdir()):
        if not path.is_file() or path.name.startswith("."):
            continue
        key = object_key(safe_lot_id(lot_id), path.name)
        ctype = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        try:
            client.upload_file(
                str(path),
                bucket,
                key,
                ExtraArgs={
                    "ContentType": ctype,
                    "CacheControl": "public, max-age=604800, immutable",
                },
            )
            uploaded += 1
        except Exception as exc:
            logger.warning("R2 upload %s: %s", key, exc)
    if uploaded:
        logger.info("R2 uploaded %s files for lot %s", uploaded, lot_id)
    return uploaded


def delete_lot_prefix(lot_id: str) -> int:
    """Delete all R2 objects under lots/{id}/. Returns deleted count."""
    if not r2_enabled():
        return 0
    from app.services.lot_photos import safe_lot_id

    client = _client()
    if client is None:
        return 0
    bucket = get_settings().r2_bucket.strip()
    prefix = f"{_KEY_PREFIX}/{safe_lot_id(lot_id)}/"
    deleted = 0
    try:
        token: str | None = None
        while True:
            kwargs: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": 1000}
            if token:
                kwargs["ContinuationToken"] = token
            resp = client.list_objects_v2(**kwargs)
            objs = [{"Key": o["Key"]} for o in resp.get("Contents") or []]
            if objs:
                client.delete_objects(Bucket=bucket, Delete={"Objects": objs, "Quiet": True})
                deleted += len(objs)
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
    except Exception as exc:
        logger.warning("R2 delete %s: %s", prefix, exc)
        return deleted
    if deleted:
        logger.info("R2 deleted %s objects for lot %s", deleted, lot_id)
    return deleted


def promote_gallery_urls(
    lot_id: str,
    urls: list[str],
    *,
    region: str | None = None,
    source: str | None = None,
) -> list[str]:
    """Upload local archive to R2 (usa/uk) and rewrite `/api/lot-photos` → CDN URLs."""
    if not urls or not r2_enabled():
        return urls
    if not region_uses_cdn(region, source):
        return urls

    from app.services.lot_photos import is_local_photo

    has_local = any(is_local_photo(u) for u in urls)
    if not has_local:
        return urls

    upload_lot_dir(lot_id)

    out: list[str] = []
    seen: set[str] = set()
    for raw in urls:
        u = (raw or "").strip()
        if not u:
            continue
        if is_local_photo(u):
            cdn = local_api_to_cdn_url(u)
            u = cdn or u
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out
