"""Шапка бланка разборки New Jersey — как в файле «ШАБЛОН РАЗБОРА X.xlsx» от разборки.

Строка 1: ``2011 JEEP GRAND CHEROKEE LAREDO    Black     VIN: 1J4RR4GG6BC596735``
Строка 2: ``Engine: 3.6L V-6 DOHC, VVT, 290HP     Stock#: 45792427``
Справа от обеих строк — код машины на разборке (``X000``), его ставит менеджер.
"""

from __future__ import annotations

from app.models.cabinet import DealOut

_GAP = "    "
_WIDE_GAP = "     "


def dismantle_header_lines(deal: DealOut) -> list[str]:
    """Две строки шапки из данных сделки; всё берётся из сделки и характеристик лота."""
    title = " ".join((deal.title or "").split()).upper()
    specs = deal.specs
    color = " ".join((specs.exterior_color or "").split()) if specs else ""
    engine = " ".join((specs.engine or "").split()) if specs else ""
    vin = (deal.vin or "").strip().upper()
    lot = (deal.lot_number or "").strip()

    first = [p for p in (title, color) if p]
    first_line = _GAP.join(first) if first else ""
    first_line = f"{first_line}{_WIDE_GAP}VIN: {vin or '—'}" if first_line else f"VIN: {vin or '—'}"
    second_line = f"Engine: {engine or '—'}{_WIDE_GAP}Stock#: {lot or '—'}"
    return [first_line, second_line]
