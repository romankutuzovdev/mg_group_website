"""Load dismantle map templates (UK / USA) from Excel-derived JSON."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_UK_PATH = _DATA_DIR / "dismantle_map_template.json"
_USA_PATH = _DATA_DIR / "dismantle_map_template_usa.json"
_PATHS = {
    "uk": _UK_PATH,
    "usa": _USA_PATH,
    "usa_nj": _DATA_DIR / "dismantle_map_template_usa_nj.json",
    "usa_tx": _DATA_DIR / "dismantle_map_template_usa_tx.json",
}
_YARD_VARIANTS = {"new_jersey": "usa_nj", "texas": "usa_tx"}


def map_variant_for_deal(origin_region: str | None, dismantle_yard: str | None = "") -> str:
    """UK → England form. USA → form of the chosen yard.

    Deals without a yard keep the old USA form, so filled maps stay visible.
    A yard whose form is not in data/ yet also gets the old USA form.
    """
    region = (origin_region or "usa").strip().lower()
    if region == "uk":
        return "uk"
    variant = _YARD_VARIANTS.get((dismantle_yard or "").strip().lower())
    if variant and _PATHS[variant].exists():
        return variant
    return "usa"


@lru_cache(maxsize=8)
def load_dismantle_template(variant: str = "uk") -> dict[str, Any]:
    path = _PATHS.get(variant, _UK_PATH)
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.setdefault("variant", variant)
    return raw


def load_dismantle_template_for_deal(
    origin_region: str | None, dismantle_yard: str | None = ""
) -> dict[str, Any]:
    return load_dismantle_template(map_variant_for_deal(origin_region, dismantle_yard))
