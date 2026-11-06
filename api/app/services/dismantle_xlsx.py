"""Build Excel workbook for a deal dismantle map (UK or USA layout)."""

from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from app.models.cabinet import DismantleMapOut


def _cell_value(value: object) -> object:
    if value is None:
        return ""
    if isinstance(value, str):
        return ILLEGAL_CHARACTERS_RE.sub("", value)
    return value


def build_dismantle_xlsx(data: DismantleMapOut) -> bytes:
    variant = (data.variant or "").lower()
    if variant == "usa_nj":
        return _build_usa_nj_xlsx(data)
    if variant == "usa_tx":
        return _build_usa_tx_xlsx(data)
    if variant == "usa":
        return _build_usa_xlsx(data)
    return _build_uk_xlsx(data)


def _section_order(data: DismantleMapOut) -> list[str]:
    order = list(data.sections or [])
    if order:
        return order
    seen: list[str] = []
    for c in data.cells:
        if c.section and c.section not in seen:
            seen.append(c.section)
    return seen


def _build_uk_xlsx(data: DismantleMapOut) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Карта разбора"

    thin = Border(
        left=Side(style="thin", color="D4D4D4"),
        right=Side(style="thin", color="D4D4D4"),
        top=Side(style="thin", color="D4D4D4"),
        bottom=Side(style="thin", color="D4D4D4"),
    )
    header_fill = PatternFill("solid", fgColor="0D3F10")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    section_fill = PatternFill("solid", fgColor="E8F5E9")
    section_font = Font(bold=True, color="0D3F10", size=11)
    title_font = Font(bold=True, size=14, color="0D3F10")
    label_font = Font(size=10, color="666666")

    ws.merge_cells("A1:E1")
    ws["A1"] = _cell_value(data.title or "Карта разбора")
    ws["A1"].font = title_font
    ws["A1"].alignment = Alignment(vertical="center")

    ws.merge_cells("A2:E2")
    hint = data.vehicle_header_hint or "марка авто, модель, Lot#"
    ws["A2"] = _cell_value(f"{hint}: {data.vehicle_label or '—'}")
    ws["A2"].font = label_font

    if (data.general_note or "").strip():
        ws.merge_cells("A3:E3")
        ws["A3"] = _cell_value(f"Комментарий: {data.general_note.strip()}")
        ws["A3"].font = label_font
        ws["A3"].alignment = Alignment(wrap_text=True, vertical="top")
        header_row = 5
    else:
        header_row = 4

    headers = ["№", "Наименование", "Кол", "Доп упак", "Примечание"]
    for col, text in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=col, value=text)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin

    row = header_row + 1
    for section in _section_order(data):
        cells = [c for c in data.cells if c.section == section]
        if not cells:
            continue
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=5)
        sec = ws.cell(row=row, column=1, value=_cell_value(section))
        sec.fill = section_fill
        sec.font = section_font
        sec.alignment = Alignment(vertical="center")
        for col in range(1, 6):
            ws.cell(row=row, column=col).border = thin
            ws.cell(row=row, column=col).fill = section_fill
        row += 1

        for item in cells:
            values = [
                "" if item.is_note_only else (item.num if item.num is not None else ""),
                item.name,
                "" if item.is_note_only else item.qty,
                "" if item.is_note_only else item.packing,
                item.note,
            ]
            for col, value in enumerate(values, start=1):
                cell = ws.cell(row=row, column=col, value=_cell_value(value))
                cell.border = thin
                cell.alignment = Alignment(vertical="center", wrap_text=True)
            row += 1

    widths = [6, 42, 10, 14, 28]
    for i, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width

    ws.row_dimensions[1].height = 22
    ws.freeze_panes = f"A{header_row + 1}"

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_usa_nj_xlsx(data: DismantleMapOut) -> bytes:
    """New Jersey yard form: same layout as the paper blank, Done stays for the yard."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Бланк разбора"

    thin = Border(
        left=Side(style="thin", color="000000"),
        right=Side(style="thin", color="000000"),
        top=Side(style="thin", color="000000"),
        bottom=Side(style="thin", color="000000"),
    )
    bold = Font(name="Arial", size=10, bold=True)
    plain = Font(name="Calibri", size=10)

    def merged_row(row: int, text: str, font: Font, align: Alignment) -> None:
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=5)
        ws.cell(row=row, column=1, value=_cell_value(text)).font = font
        ws.cell(row=row, column=1).alignment = align
        for col in range(1, 6):
            ws.cell(row=row, column=col).border = thin

    header = f"Lot: # {data.lot_number or '—'}    VIN: {data.vin or '—'}    Model: {data.deal_title or '—'}"
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    merged_row(1, header, plain, center)
    for col in range(1, 6):
        ws.cell(row=1, column=col).fill = PatternFill("solid", fgColor="EEEEEE")

    headers = ["#", "Наименование / Part name", "Order", "Done", "Примечание/Сustomer notes"]
    for col, text in enumerate(headers, start=1):
        cell = ws.cell(row=2, column=col, value=text)
        cell.font = bold
        cell.alignment = center
        cell.border = thin

    row = 3
    for section in _section_order(data):
        cells = [c for c in data.cells if c.section == section]
        if not cells:
            continue
        merged_row(row, section, bold, center)
        row += 1
        for item in cells:
            values = [item.num if item.num is not None else "", item.name, item.qty, "", item.note]
            for col, value in enumerate(values, start=1):
                cell = ws.cell(row=row, column=col, value=_cell_value(value))
                cell.font = plain
                cell.border = thin
                cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
            row += 1

    if (data.general_note or "").strip():
        merged_row(
            row,
            f"Комментарий: {data.general_note.strip()}",
            plain,
            Alignment(horizontal="left", vertical="top", wrap_text=True),
        )
        ws.row_dimensions[row].height = 45

    for letter, width in zip("ABCDE", (6, 34, 6, 6, 24)):
        ws.column_dimensions[letter].width = width
    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 24
    ws.freeze_panes = "A3"
    ws.page_setup.orientation = "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_usa_tx_xlsx(data: DismantleMapOut) -> bytes:
    """Texas yard form: header and table in the same rows as the yard's own file."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Карта разбора (Dismantle form)"

    thin = Border(
        left=Side(style="thin", color="000000"),
        right=Side(style="thin", color="000000"),
        top=Side(style="thin", color="000000"),
        bottom=Side(style="thin", color="000000"),
    )
    label = Font(name="Courier New", size=14, bold=True)
    value = Font(name="Arial", size=14)
    bold = Font(name="Arial", size=12, bold=True)
    plain = Font(name="Arial", size=12)
    yellow = PatternFill("solid", fgColor="FFF59D")
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)

    header = (("LOT:", data.lot_number), ("VIN:", data.vin), ("MAKE, MODEL:", data.deal_title))
    for row, (name, text) in enumerate(header, start=1):
        ws.cell(row=row, column=1, value=name).font = label
        ws.cell(row=row, column=1).alignment = Alignment(horizontal="right")
        ws.cell(row=row, column=2, value=_cell_value(text or "—")).font = value

    ws["A5"] = "Общие требования (замечания) к разбору | General dismantling requirements"
    ws["A5"].font = bold
    ws.merge_cells("A6:D10")
    ws["A6"] = _cell_value((data.general_note or "").strip())
    ws["A6"].font = plain
    ws["A6"].alignment = Alignment(vertical="top", wrap_text=True)

    headers = ["Part name (RUS)", "Part name (ENG)", "Save", "Примечания | Notes", "Снято"]
    for col, text in enumerate(headers, start=1):
        cell = ws.cell(row=12, column=col, value=text)
        cell.font = bold
        cell.alignment = center
        cell.border = thin

    row = 13
    for section in _section_order(data):
        cells = [c for c in data.cells if c.section == section]
        if not cells:
            continue
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=5)
        ws.cell(row=row, column=1, value=_cell_value(section)).font = bold
        ws.cell(row=row, column=1).alignment = center
        for col in range(1, 6):
            ws.cell(row=row, column=col).border = thin
        row += 1
        for item in cells:
            is_extra = item.name.startswith("Доп. позиция")
            values = [
                "" if is_extra else item.name,
                "" if is_extra else (item.name_en or ""),
                item.qty,
                item.note,
                "",
            ]
            for col, text in enumerate(values, start=1):
                cell = ws.cell(row=row, column=col, value=_cell_value(text))
                cell.font = plain
                cell.border = thin
                cell.alignment = Alignment(vertical="center", wrap_text=True)
                if col in (3, 4):
                    cell.fill = yellow
            row += 1

    ws.cell(row=row, column=1, value="*** Конец карты").font = bold
    ws.cell(row=row, column=2, value="*** End of the card").font = bold

    save_values = DataValidation(type="list", formula1='"да,нет,все"', allow_blank=True)
    save_values.add(f"C13:C{row - 1}")
    ws.add_data_validation(save_values)
    for letter, width in zip("ABCDE", (52, 39, 8, 34, 8)):
        ws.column_dimensions[letter].width = width
    ws.freeze_panes = "A13"
    ws.page_setup.orientation = "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_usa_xlsx(data: DismantleMapOut) -> bytes:
    """USA form: Part name RUS/ENG, Qty (1–15), Notes."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Карта разбора (США)"

    thin = Border(
        left=Side(style="thin", color="D4D4D4"),
        right=Side(style="thin", color="D4D4D4"),
        top=Side(style="thin", color="D4D4D4"),
        bottom=Side(style="thin", color="D4D4D4"),
    )
    header_fill = PatternFill("solid", fgColor="0D3F10")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    section_fill = PatternFill("solid", fgColor="E8F5E9")
    section_font = Font(bold=True, color="0D3F10", size=11)
    title_font = Font(bold=True, size=14, color="0D3F10")
    label_font = Font(size=10, color="666666")
    yellow = PatternFill("solid", fgColor="FFF59D")

    ws.merge_cells("A1:D1")
    ws["A1"] = _cell_value(data.title or "Карта разбора (США)")
    ws["A1"].font = title_font

    ws.merge_cells("A2:D2")
    hint = data.vehicle_header_hint or "MAKE, MODEL, LOT#, VIN"
    ws["A2"] = _cell_value(f"{hint}: {data.vehicle_label or '—'}")
    ws["A2"].font = label_font

    if (data.general_note or "").strip():
        ws.merge_cells("A3:D3")
        ws["A3"] = _cell_value(f"Notes / Комментарий: {data.general_note.strip()}")
        ws["A3"].font = label_font
        ws["A3"].alignment = Alignment(wrap_text=True, vertical="top")
        usa_header_row = 5
    else:
        usa_header_row = 4

    headers = ["Part name (RUS)", "Part name (ENG)", "Снять", "Примечания | Notes"]
    for col, text in enumerate(headers, start=1):
        cell = ws.cell(row=usa_header_row, column=col, value=text)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin

    row = usa_header_row + 1
    for section in _section_order(data):
        cells = [c for c in data.cells if c.section == section]
        if not cells:
            continue
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
        sec = ws.cell(row=row, column=1, value=_cell_value(section))
        sec.fill = section_fill
        sec.font = section_font
        for col in range(1, 5):
            ws.cell(row=row, column=col).border = thin
            ws.cell(row=row, column=col).fill = section_fill
        row += 1

        for item in cells:
            values = [item.name, item.name_en or "", item.qty, item.note]
            for col, value in enumerate(values, start=1):
                cell = ws.cell(row=row, column=col, value=_cell_value(value))
                cell.border = thin
                cell.alignment = Alignment(vertical="center", wrap_text=True)
                if col in (3, 4):
                    cell.fill = yellow
            row += 1

    widths = [42, 42, 12, 36]
    for i, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width

    ws.row_dimensions[1].height = 22
    ws.freeze_panes = f"A{usa_header_row + 1}"

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
