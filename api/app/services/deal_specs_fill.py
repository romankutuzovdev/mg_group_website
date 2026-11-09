"""Заполнить характеристики сделки (цвет, двигатель, …) из лота в каталоге.

Нужно для шапки бланка разборки New Jersey: цвет и двигатель берутся из ``specs``.
У старых сделок они часто пустые — подтягиваем из ``lots.db`` по ссылке или номеру лота,
не трогая уже заполненные поля.
"""

from __future__ import annotations

from typing import Any

from app.data.store import lot_store
from app.models.cabinet import DealOut, DealSpecs

SPEC_FIELDS: tuple[str, ...] = tuple(DealSpecs.model_fields.keys())


def _text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text in ("—", "None", "null") else text


def _odometer_text(value: Any, unit: Any) -> str:
    if value is None:
        return ""
    try:
        num = int(round(float(value)))
    except (TypeError, ValueError):
        return _text(value)
    if num <= 0:
        return ""
    suffix = "km" if str(unit or "").lower().startswith("k") else "mi"
    return f"{num} {suffix}"


def specs_from_lot_payload(payload: dict[str, Any]) -> DealSpecs:
    """То же сопоставление, что делает админка при создании сделки из лота."""
    return DealSpecs(
        location=_text(payload.get("location")),
        odometer=_odometer_text(payload.get("odometer"), payload.get("odometerUnit")),
        category=_text(payload.get("category")),
        body_style=_text(payload.get("bodyStyle")),
        engine=_text(payload.get("engine")),
        cylinders=_text(payload.get("cylinders")),
        fuel=_text(payload.get("fuel")),
        transmission=_text(payload.get("transmission")),
        drive=_text(payload.get("drive")),
        exterior_color=_text(payload.get("exteriorColor")),
        primary_damage=_text(payload.get("primaryDamage")),
        secondary_damage=_text(payload.get("secondaryDamage")),
        loss_type=_text(payload.get("lossType")),
        start_code=_text(payload.get("startCode")),
        key_info=_text(payload.get("keyInfo")),
        sale_document=_text(payload.get("saleDocument")),
        seller=_text(payload.get("seller")),
    )


def merge_specs(
    current: DealSpecs | None, incoming: DealSpecs, *, overwrite: bool = False
) -> tuple[DealSpecs, list[str]]:
    """Заполняет пустые поля ``current`` из ``incoming``. Возвращает (specs, какие поля изменились)."""
    base = current or DealSpecs()
    merged = base.model_dump()
    changed: list[str] = []
    for field in SPEC_FIELDS:
        new = _text(getattr(incoming, field))
        old = _text(merged.get(field))
        if not new or new == old:
            continue
        if old and not overwrite:
            continue
        merged[field] = new
        changed.append(field)
    return DealSpecs(**merged), changed


def find_lot_payload_for_deal(deal: DealOut) -> dict[str, Any] | None:
    """Лот из каталога по ссылке сделки, иначе по номеру лота. Без Chrome."""
    from app.services.lot_lookup import lookup_in_production_catalog, lot_to_calculator_payload

    url = (deal.lot_url or "").strip()
    if url:
        try:
            payload = lookup_in_production_catalog(url)
        except Exception:
            payload = None
        if payload:
            return payload
    lot_number = (deal.lot_number or "").strip()
    if lot_number:
        sources = {"copart_uk"} if deal.origin_region == "uk" else {"copart", "iaai", "bidcars"}
        lot = lot_store.find_by_lot_number(lot_number, sources=sources)
        if lot is None:
            lot = lot_store.find_by_lot_number(lot_number)
        if lot is not None:
            return lot_to_calculator_payload(lot, url=url or lot.lotUrl or "", via="catalog")
    return None


def specs_filled_from_catalog(
    deal: DealOut, *, overwrite: bool = False
) -> tuple[DealSpecs, list[str]] | None:
    """Новые specs сделки по каталогу или ``None``, если лот не найден."""
    payload = find_lot_payload_for_deal(deal)
    if not payload:
        return None
    return merge_specs(deal.specs, specs_from_lot_payload(payload), overwrite=overwrite)


def needs_header_specs(deal: DealOut) -> bool:
    """Для шапки бланка нужны цвет и двигатель."""
    specs = deal.specs or DealSpecs()
    return not (_text(specs.exterior_color) and _text(specs.engine))
