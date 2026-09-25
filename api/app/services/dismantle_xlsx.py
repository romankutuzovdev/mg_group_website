"""Build Excel workbook for a deal dismantle map."""

from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.models.cabinet import DismantleMapOut


def build_dismantle_xlsx(data: DismantleMapOut) -> bytes:
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
    ws["A1"] = data.title or "Карта разбора"
    ws["A1"].font = title_font
    ws["A1"].alignment = Alignment(vertical="center")

    ws.merge_cells("A2:E2")
    hint = data.vehicle_header_hint or "марка авто, модель, Lot#"
    ws["A2"] = f"{hint}: {data.vehicle_label or '—'}"
    ws["A2"].font = label_font

    headers = ["№", "Наименование", "Кол", "Доп упак", "Примечание"]
    for col, text in enumerate(headers, start=1):
        cell = ws.cell(row=4, column=col, value=text)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin

    order = data.sections or []
    if not order:
        seen: list[str] = []
        for c in data.cells:
            if c.section and c.section not in seen:
                seen.append(c.section)
        order = seen

    row = 5
    for section in order:
        cells = [c for c in data.cells if c.section == section]
        if not cells:
            continue
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=5)
        sec = ws.cell(row=row, column=1, value=section)
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
                cell = ws.cell(row=row, column=col, value=value)
                cell.border = thin
                cell.alignment = Alignment(vertical="center", wrap_text=True)
            row += 1

    widths = [6, 42, 10, 14, 28]
    for i, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width

    ws.row_dimensions[1].height = 22
    ws.freeze_panes = "A5"

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
