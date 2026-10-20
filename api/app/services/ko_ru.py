"""Korean → Russian for Encar lots.

Uses a static dictionary first (cities, trims, fuel), then free Google
Translate (`client=gtx`, no API key) for leftover Hangul. Results are cached
on disk so re-runs and bulk migration stay cheap.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger("mg.ko_ru")

_HANGUL = re.compile(r"[\uac00-\ud7a3]")
_CACHE_LOCK = threading.RLock()
_mem: dict[str, str] = {}
_dirty = False
_last_save = 0.0
_cache_loaded = False

# --- Static maps (no network) -------------------------------------------------

CITY_KO_RU: dict[str, str] = {
    "서울": "Сеул",
    "부산": "Пусан",
    "대구": "Тэгу",
    "인천": "Инчхон",
    "광주": "Кванджу",
    "대전": "Тэджон",
    "울산": "Ульсан",
    "세종": "Седжон",
    "경기": "Кёнгидо",
    "경기도": "Кёнгидо",
    "강원": "Канвондо",
    "강원도": "Канвондо",
    "충북": "Чхунчхон-Пукто",
    "충남": "Чхунчхон-Намдо",
    "전북": "Чолла-Пукто",
    "전남": "Чолла-Намдо",
    "경북": "Кёнсан-Пукто",
    "경남": "Кёнсан-Намдо",
    "제주": "Чеджу",
    "제주도": "Чеджу",
    "Korea": "Корея",
    "한국": "Корея",
}

FUEL_KO_RU: dict[str, str] = {
    "가솔린": "Бензин",
    "휘발유": "Бензин",
    "디젤": "Дизель",
    "LPG": "Газ (LPG)",
    "LPG(일반인 구입)": "Газ (LPG)",
    "전기": "Электро",
    "하이브리드": "Гибрид",
    "가솔린+전기": "Гибрид",
    "디젤+전기": "Гибрид",
    "수소": "Водород",
    "Gasoline": "Бензин",
    "Diesel": "Дизель",
    "Electric": "Электро",
    "Hybrid": "Гибрид",
    "Gas": "Газ (LPG)",
    "Hydrogen": "Водород",
}

TRANS_KO_RU: dict[str, str] = {
    "오토": "Автомат",
    "자동": "Автомат",
    "수동": "Механика",
    "CVT": "CVT",
    "세미오토": "Автомат",
    "Automatic": "Автомат",
    "Manual": "Механика",
}

# Common Encar trim / option words → Russian (or Latin brand trim kept readable)
TOKEN_KO_RU: dict[str, str] = {
    "노블레스": "Noblesse",
    "프레스티지": "Prestige",
    "프리미엄": "Premium",
    "스페셜": "Special",
    "스마트": "Smart",
    "모던": "Modern",
    "인스퍼레이션": "Inspiration",
    "캘리그래피": "Calligraphy",
    "익스클루시브": "Exclusive",
    "시그니처": "Signature",
    "리미티드": "Limited",
    "트렌디": "Trendy",
    "스타일": "Style",
    "럭셔리": "Luxury",
    "디럭스": "Deluxe",
    "스탠다드": "Standard",
    "기본형": "базовая",
    "인승": "мест",
    "인 승": "мест",
    "디젤": "дизель",
    "가솔린": "бензин",
    "하이브리드": "гибрид",
    "전기": "электро",
    "터보": "турбо",
    "4륜구동": "4WD",
    "사륜구동": "4WD",
    "2륜구동": "2WD",
    "전륜": "передний привод",
    "후륜": "задний привод",
    "AWD": "AWD",
    "2WD": "2WD",
    "4WD": "4WD",
    "밴": "ван",
    "왜건": "универсал",
    "해치백": "хэтчбек",
    "세단": "седан",
    "쿠페": "купе",
    "SUV": "SUV",
    "팩": "пакет",
    "패키지": "пакет",
    "플러스": "Plus",
    "그래비티": "Gravity",
    "센슈어스": "Sensuous",
    "르블랑": "Le Blanc",
    "더 뉴": "The New",
    "더뉴": "The New",
    "올 뉴": "All New",
    "올뉴": "All New",
    "페이스리프트": "рестайлинг",
    "롱바디": "длинная база",
    "숏바디": "короткая база",
    "9인승": "9 мест",
    "7인승": "7 мест",
    "11인승": "11 мест",
    "12인승": "12 мест",
    "15인승": "15 мест",
}

MAKE_EXTRA: dict[str, str] = {
    "Kg모빌리티(쌍용)": "KG Mobility (SsangYong)",
    "KG모빌리티(쌍용)": "KG Mobility (SsangYong)",
    "케이지모빌리티(쌍용)": "KG Mobility (SsangYong)",
    "쌍용자동차": "KG Mobility",
}


def has_hangul(text: str) -> bool:
    return bool(_HANGUL.search(text or ""))


def _cache_path() -> Path:
    try:
        from app.config import get_settings

        base = Path(get_settings().lots_json_path).resolve().parent
    except Exception:
        base = Path(__file__).resolve().parents[2] / "data"
    return base / "ko_ru_cache.json"


def _load_cache() -> None:
    global _mem, _cache_loaded
    if _cache_loaded:
        return
    _cache_loaded = True
    path = _cache_path()
    if not path.is_file():
        return
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            with _CACHE_LOCK:
                _mem.update({str(k): str(v) for k, v in raw.items() if v})
    except Exception as exc:
        logger.warning("ko_ru cache load: %s", exc)


def _save_cache(force: bool = False) -> None:
    global _dirty, _last_save
    _load_cache()
    with _CACHE_LOCK:
        if not _dirty and not force:
            return
        now = time.monotonic()
        if not force and now - _last_save < 8.0:
            return
        snap = dict(_mem)
        _dirty = False
        _last_save = now
    path = _cache_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(snap, ensure_ascii=False, indent=0, sort_keys=True),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("ko_ru cache save: %s", exc)


def _dict_get(table: dict[str, str], text: str) -> str | None:
    t = (text or "").strip()
    if not t:
        return None
    if t in table:
        return table[t]
    compact = t.replace(" ", "")
    if compact in table:
        return table[compact]
    return None


def _apply_tokens(text: str) -> str:
    """Replace known Hangul tokens longest-first."""
    out = text
    for ko, ru in sorted(TOKEN_KO_RU.items(), key=lambda kv: len(kv[0]), reverse=True):
        if ko in out:
            out = out.replace(ko, ru)
    # "9  мест" spacing
    out = re.sub(r"(\d)\s*мест", r"\1 мест", out)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out


def _google_free_ko_ru(text: str) -> str | None:
    """Unofficial Google Translate endpoint — free, no key."""
    q = (text or "").strip()
    if not q:
        return None
    url = (
        "https://translate.googleapis.com/translate_a/single"
        f"?client=gtx&sl=ko&tl=ru&dt=t&q={urllib.parse.quote(q)}"
    )
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; MG.GROUP/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
        parts: list[str] = []
        if isinstance(data, list) and data and isinstance(data[0], list):
            for chunk in data[0]:
                if isinstance(chunk, list) and chunk and isinstance(chunk[0], str):
                    parts.append(chunk[0])
        joined = "".join(parts).strip()
        return joined or None
    except Exception as exc:
        logger.debug("google translate fail: %s", exc)
        return None


def translate_ko_ru(text: str, *, allow_network: bool = True) -> str:
    """Translate a single field. Safe for Latin-only / empty input."""
    _load_cache()
    raw = (text or "").strip()
    if not raw or raw in {"—", "-", "N/A", "n/a"}:
        return raw

    hit = _dict_get(CITY_KO_RU, raw) or _dict_get(FUEL_KO_RU, raw) or _dict_get(
        TRANS_KO_RU, raw
    ) or _dict_get(MAKE_EXTRA, raw)
    if hit:
        return hit

    if not has_hangul(raw):
        # Still map English fuel labels left from old scrapes
        return _dict_get(FUEL_KO_RU, raw) or _dict_get(TRANS_KO_RU, raw) or raw

    with _CACHE_LOCK:
        if raw in _mem:
            return _mem[raw]

    tokenized = _apply_tokens(raw)
    if not has_hangul(tokenized):
        with _CACHE_LOCK:
            _mem[raw] = tokenized
            global _dirty
            _dirty = True
        _save_cache()
        return tokenized

    if not allow_network:
        return tokenized

    translated = _google_free_ko_ru(tokenized)
    # Prefer tokenized if Google returns empty / same Hangul
    result = translated if translated and not has_hangul(translated) else (
        translated or tokenized
    )
    # If Google left Hangul, keep tokenized mix
    if has_hangul(result) and not has_hangul(tokenized):
        result = tokenized

    with _CACHE_LOCK:
        _mem[raw] = result
        _dirty = True
    _save_cache()
    # gentle rate limit for bulk
    time.sleep(0.05)
    return result


def localize_encar_fields(
    *,
    make: str = "",
    model: str = "",
    location: str = "",
    fuel: str = "",
    transmission: str = "",
    exterior_color: str = "",
    body_style: str = "",
    allow_network: bool = True,
) -> dict[str, str]:
    make_out = _dict_get(MAKE_EXTRA, make) or translate_ko_ru(
        make, allow_network=allow_network
    )
    # Brands stay Latin when already mapped by ENCAR_MAKE_EN
    if not has_hangul(make) and make.strip():
        make_out = make.strip()

    return {
        "make": make_out,
        "model": translate_ko_ru(model, allow_network=allow_network),
        "location": translate_ko_ru(location, allow_network=allow_network),
        "fuel": translate_ko_ru(fuel, allow_network=allow_network),
        "transmission": translate_ko_ru(transmission, allow_network=allow_network),
        "exteriorColor": translate_ko_ru(exterior_color, allow_network=allow_network)
        if exterior_color and exterior_color != "—"
        else (exterior_color or "—"),
        "bodyStyle": translate_ko_ru(body_style, allow_network=allow_network)
        if body_style
        else "",
    }


def localize_lot_dict(lot: Any, *, allow_network: bool = True) -> dict[str, Any] | None:
    """Return field updates for an AuctionLot-like object, or None if unchanged."""
    region = getattr(lot, "region", None) or (lot.get("region") if isinstance(lot, dict) else "")
    if str(region).lower() != "korea":
        return None

    def g(key: str, default: str = "") -> str:
        if isinstance(lot, dict):
            return str(lot.get(key) or default)
        return str(getattr(lot, key, default) or default)

    loc = localize_encar_fields(
        make=g("make"),
        model=g("model"),
        location=g("location"),
        fuel=g("fuel"),
        transmission=g("transmission"),
        exterior_color=g("exteriorColor"),
        body_style=g("bodyStyle") or "",
        allow_network=allow_network,
    )
    updates: dict[str, Any] = {}
    mapping = {
        "make": "make",
        "model": "model",
        "location": "location",
        "fuel": "fuel",
        "transmission": "transmission",
        "exteriorColor": "exteriorColor",
        "bodyStyle": "bodyStyle",
    }
    for src, dst in mapping.items():
        new_v = loc.get(src) or ""
        old_v = g(dst)
        if new_v and new_v != old_v:
            updates[dst] = new_v
    # Russian label
    if g("titleLabel") in {"Encar (Korea)", "Encar (korea)", ""}:
        updates["titleLabel"] = "Encar (Корея)"
    return updates or None


def localize_korea_store(*, limit: int = 0, allow_network: bool = True) -> dict[str, int]:
    """Rewrite Hangul fields on korea lots in LotStore and persist."""
    from app.data.store import lot_store
    from app.models.lots import AuctionLot

    with lot_store._lock:
        lots = [l for l in lot_store._by_id.values() if (l.region or "") == "korea"]

    uniq: set[str] = set()
    # Warm cache on unique Hangul strings first (one network call per phrase).
    if allow_network:
        for lot in lots:
            for val in (
                lot.make,
                lot.model,
                lot.location,
                lot.fuel,
                lot.transmission,
                lot.exteriorColor,
                lot.bodyStyle or "",
            ):
                s = (val or "").strip()
                if s and has_hangul(s):
                    uniq.add(s)
        logger.info("ko_ru warming %s unique Hangul phrases", len(uniq))
        for i, phrase in enumerate(sorted(uniq, key=len)):
            translate_ko_ru(phrase, allow_network=True)
            if i and i % 100 == 0:
                _save_cache(force=True)
                logger.info("ko_ru warm progress %s/%s", i, len(uniq))

    changed = 0
    scanned = 0
    skipped = 0
    for lot in lots:
        scanned += 1
        if limit and changed >= limit:
            break
        # Cache already warm — avoid further network in the apply pass
        updates = localize_lot_dict(lot, allow_network=False)
        if not updates:
            skipped += 1
            continue
        data = lot.model_dump()
        data.update(updates)
        try:
            fresh = AuctionLot.model_validate(data)
        except Exception:
            skipped += 1
            continue
        lot_store.upsert(fresh)
        changed += 1
        if changed % 500 == 0:
            logger.info("ko_ru localized %s / scanned %s", changed, scanned)
            try:
                lot_store.persist()
            except Exception:
                pass
            _save_cache(force=True)
    if changed:
        try:
            lot_store.persist()
        except Exception as exc:
            logger.warning("ko_ru persist: %s", exc)
    _save_cache(force=True)
    return {"scanned": scanned, "changed": changed, "skipped": skipped, "unique": len(uniq) if allow_network else 0}
