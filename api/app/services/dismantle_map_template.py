"""Load dismantle map template from Excel-derived JSON."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "data" / "dismantle_map_template.json"


@lru_cache(maxsize=1)
def load_dismantle_template() -> dict[str, Any]:
    raw = json.loads(_TEMPLATE_PATH.read_text(encoding="utf-8"))
    return raw
