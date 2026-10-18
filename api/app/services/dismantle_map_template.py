"""Load dismantle map templates (UK / USA) from Excel-derived JSON."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_UK_PATH = _DATA_DIR / "dismantle_map_template.json"
_USA_PATH = _DATA_DIR / "dismantle_map_template_usa.json"


def map_variant_for_region(origin_region: str | None) -> str:
    """Machine-kit map: USA → USA form, UK → England form. Default USA."""
    region = (origin_region or "usa").strip().lower()
    return "uk" if region == "uk" else "usa"


@lru_cache(maxsize=4)
def load_dismantle_template(variant: str = "uk") -> dict[str, Any]:
    path = _USA_PATH if variant == "usa" else _UK_PATH
    if not path.exists():
        path = _UK_PATH
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.setdefault("variant", variant)
    return raw


def load_dismantle_template_for_region(origin_region: str | None) -> dict[str, Any]:
    return load_dismantle_template(map_variant_for_region(origin_region))
