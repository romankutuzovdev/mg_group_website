#!/usr/bin/env python3
"""Подтянуть пустые характеристики сделок (цвет, двигатель, …) из каталога лотов.

Нужно для шапки бланка разборки New Jersey. Заполняет только пустые поля,
ничего не перезаписывает и не удаляет. Без Chrome: лот ищется в lots.db
по ссылке сделки или по номеру лота.

На VPS (из каталога api, под пользователем mg, с .env сервиса):

    cd /opt/mg-group/api
    sudo -u mg env $(grep -v '^#' .env | xargs) .venv/bin/python scripts/backfill_deal_specs.py          # показать, что изменится
    sudo -u mg env $(grep -v '^#' .env | xargs) .venv/bin/python scripts/backfill_deal_specs.py --apply  # записать

Перед записью делает копию cabinet.db рядом: cabinet.db.bak-YYYYmmdd-HHMMSS.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.data.store import lot_store  # noqa: E402
from app.models.cabinet import DealOut, DealSpecs, DealUpdate  # noqa: E402
from app.services.cabinet_store import cabinet_store  # noqa: E402
from app.services.lot_lookup import (  # noqa: E402
    lookup_in_production_catalog,
    lot_to_calculator_payload,
)

FIELDS = tuple(DealSpecs.model_fields.keys())


def _text(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text in ("—", "None", "null") else text


def _odometer_text(value, unit) -> str:
    if value is None:
        return ""
    try:
        num = int(round(float(value)))
    except (TypeError, ValueError):
        return _text(value)
    if num <= 0:
        return ""
    return f"{num} {'km' if str(unit or '').lower().startswith('k') else 'mi'}"


def specs_from_payload(p: dict) -> DealSpecs:
    return DealSpecs(
        location=_text(p.get("location")),
        odometer=_odometer_text(p.get("odometer"), p.get("odometerUnit")),
        category=_text(p.get("category")),
        body_style=_text(p.get("bodyStyle")),
        engine=_text(p.get("engine")),
        cylinders=_text(p.get("cylinders")),
        fuel=_text(p.get("fuel")),
        transmission=_text(p.get("transmission")),
        drive=_text(p.get("drive")),
        exterior_color=_text(p.get("exteriorColor")),
        primary_damage=_text(p.get("primaryDamage")),
        secondary_damage=_text(p.get("secondaryDamage")),
        loss_type=_text(p.get("lossType")),
        start_code=_text(p.get("startCode")),
        key_info=_text(p.get("keyInfo")),
        sale_document=_text(p.get("saleDocument")),
        seller=_text(p.get("seller")),
    )


def find_payload(deal: DealOut) -> dict | None:
    url = (deal.lot_url or "").strip()
    if url:
        try:
            payload = lookup_in_production_catalog(url)
        except Exception as exc:  # noqa: BLE001
            print(f"  #{deal.id}: ошибка поиска по ссылке: {exc}")
            payload = None
        if payload:
            return payload
    lot_number = (deal.lot_number or "").strip()
    if lot_number:
        sources = {"copart_uk"} if deal.origin_region == "uk" else {"copart", "iaai", "bidcars"}
        lot = lot_store.find_by_lot_number(lot_number, sources=sources) or lot_store.find_by_lot_number(lot_number)
        if lot is not None:
            return lot_to_calculator_payload(lot, url=url or lot.lotUrl or "", via="catalog")
    return None


def merge(current: DealSpecs | None, incoming: DealSpecs) -> tuple[DealSpecs, dict[str, str]]:
    merged = (current or DealSpecs()).model_dump()
    changed: dict[str, str] = {}
    for field in FIELDS:
        new = _text(getattr(incoming, field))
        if new and not _text(merged.get(field)):
            merged[field] = new
            changed[field] = new
    return DealSpecs(**merged), changed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="записать изменения (без флага — только показать)")
    ap.add_argument("--all", action="store_true", help="проверять все сделки, а не только без цвета/двигателя")
    ap.add_argument("--deal", type=int, action="append", help="только эти id сделок (можно несколько раз)")
    args = ap.parse_args()

    settings = get_settings()
    db_path = Path(settings.cabinet_db_path)
    print(f"cabinet.db: {db_path}  lots: {lot_store.count() if hasattr(lot_store, 'count') else '?'}")

    deals = cabinet_store.list_all_deals()
    if args.deal:
        wanted = set(args.deal)
        deals = [d for d in deals if d.id in wanted]
    todo = [
        d for d in deals
        if args.all or not (_text(d.specs.exterior_color) and _text(d.specs.engine))
    ]
    print(f"сделок всего {len(deals)}, проверяем {len(todo)}")

    plan: list[tuple[DealOut, DealSpecs, dict[str, str]]] = []
    not_found: list[DealOut] = []
    for deal in todo:
        payload = find_payload(deal)
        if not payload:
            not_found.append(deal)
            print(f"  #{deal.id} {deal.title} (lot {deal.lot_number or '—'}): лота нет в каталоге")
            continue
        specs, changed = merge(deal.specs, specs_from_payload(payload))
        if not changed:
            print(f"  #{deal.id} {deal.title}: в каталоге нет новых данных")
            continue
        plan.append((deal, specs, changed))
        short = {k: v for k, v in changed.items() if k in ("exterior_color", "engine")} or changed
        print(f"  #{deal.id} {deal.title}: + {short}")

    print(f"\nобновить: {len(plan)}, не найдено: {len(not_found)}")
    if not args.apply:
        print("это был просмотр. Запусти с --apply, чтобы записать.")
        return 0
    if not plan:
        return 0

    if db_path.exists():
        backup = db_path.with_name(f"{db_path.name}.bak-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(db_path, backup)
        print(f"копия базы: {backup}")
    for deal, specs, _changed in plan:
        cabinet_store.update_deal(deal.id, DealUpdate(specs=specs))
    print(f"готово: обновлено {len(plan)} сделок")
    if not_found:
        print("вручную (нет в каталоге): " + ", ".join(f"#{d.id} {d.title}" for d in not_found))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
