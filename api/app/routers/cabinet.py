from __future__ import annotations

import mimetypes
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response

from app.config import Settings, get_settings
from app.models.cabinet import (
    STAGE_KEYS,
    DealCreate,
    DealMediaOut,
    DealOut,
    DealUpdate,
    DismantleCellOut,
    DismantleCellPatch,
    DismantleMapOut,
    DismantleMetaPatch,
    FavoriteCreate,
    FavoriteLotOut,
    PaymentStageUpdate,
    StageKey,
    StageUpdate,
    UserOut,
)
from app.services.auth_deps import get_current_user, get_optional_user, require_admin_or_key
from app.services.cabinet_store import cabinet_store
from app.services.dismantle_xlsx import build_dismantle_xlsx
from app.data.store import lot_store

router = APIRouter(tags=["cabinet"])


def _require_deal_access(deal_id: int, user: UserOut) -> DealOut:
    deal = cabinet_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    owner = cabinet_store.get_deal_owner_id(deal_id)
    if owner != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not your deal")
    return deal


@router.get("/me", response_model=UserOut)
def me(user: Annotated[UserOut, Depends(get_current_user)]) -> UserOut:
    return user


@router.get("/me/deals", response_model=list[DealOut])
def my_deals(user: Annotated[UserOut, Depends(get_current_user)]) -> list[DealOut]:
    return cabinet_store.list_deals_for_user(user.id)


@router.get("/me/deals/{deal_id}", response_model=DealOut)
def my_deal(
    deal_id: int,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> DealOut:
    return _require_deal_access(deal_id, user)


@router.get("/me/deals/{deal_id}/dismantle-map", response_model=DismantleMapOut)
def my_dismantle_map(
    deal_id: int,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> DismantleMapOut:
    deal = _require_deal_access(deal_id, user)
    if deal.origin_point != "dismantle":
        raise HTTPException(status_code=404, detail="Dismantle map only for kits")
    out = cabinet_store.get_dismantle_map(deal_id)
    if not out:
        raise HTTPException(status_code=404, detail="Deal not found")
    return out


@router.get("/me/deals/{deal_id}/dismantle-map.xlsx")
def my_dismantle_map_xlsx(
    deal_id: int,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> Response:
    deal = _require_deal_access(deal_id, user)
    if deal.origin_point != "dismantle":
        raise HTTPException(status_code=404, detail="Dismantle map only for kits")
    out = cabinet_store.get_dismantle_map(deal_id)
    if not out:
        raise HTTPException(status_code=404, detail="Deal not found")
    payload = build_dismantle_xlsx(out)
    label = (out.vehicle_label or deal.title or f"deal-{deal_id}").strip()
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_", " ") else "_" for ch in label)
    safe = safe.strip().replace(" ", "_")[:80] or f"deal-{deal_id}"
    filename = f"karta_razbora_{safe}.xlsx"
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.patch("/me/deals/{deal_id}/dismantle-map", response_model=DismantleMapOut)
async def patch_my_dismantle_meta(
    deal_id: int,
    body: DismantleMetaPatch,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> DismantleMapOut:
    deal = _require_deal_access(deal_id, user)
    if deal.origin_point != "dismantle":
        raise HTTPException(status_code=404, detail="Dismantle map only for kits")
    was_completed = cabinet_store.was_dismantle_completed(deal_id)
    try:
        out = cabinet_store.patch_dismantle_meta(deal_id, body)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Deal not found") from exc

    # Client marked map as filled → notify assigning manager in Telegram
    if body.completed is True and not was_completed and out.completed:
        from app.services.telegram_notify import notify_dismantle_map_completed

        manager_tg = (
            deal.manager_telegram_id
            or cabinet_store.get_deal_manager_telegram_id(deal_id)
        )
        await notify_dismantle_map_completed(
            manager_telegram_id=manager_tg,
            deal_id=deal.id,
            title=deal.title,
            vehicle_label=out.vehicle_label,
            client_name=deal.client_name or user.first_name,
            client_telegram_id=deal.client_telegram_id or user.telegram_id,
            client_username=deal.client_username or user.username,
        )
    return out


@router.patch(
    "/me/deals/{deal_id}/dismantle-map/cells/{item_key}",
    response_model=DismantleCellOut,
)
def patch_my_dismantle_cell(
    deal_id: int,
    item_key: str,
    body: DismantleCellPatch,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> DismantleCellOut:
    _require_deal_access(deal_id, user)
    try:
        return cabinet_store.patch_dismantle_cell(deal_id, item_key, body)
    except KeyError as exc:
        detail = "Item not found" if "item" in str(exc) else "Deal not found"
        raise HTTPException(status_code=404, detail=detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _resolve_lot_id(raw: str) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    lot = lot_store.get_by_id(value) or lot_store.get_by_slug(value)
    return lot.id if lot else None


def _favorite_out(lot_id: str, created_at: str) -> FavoriteLotOut | None:
    lot = lot_store.get_by_id(lot_id)
    if not lot:
        return None
    return FavoriteLotOut(
        lot_id=lot.id,
        slug=lot.slug,
        title=f"{lot.year} {lot.make} {lot.model}".strip(),
        year=lot.year,
        make=lot.make,
        model=lot.model,
        image_url=lot.imageUrl or "",
        current_bid=float(lot.currentBid or 0),
        currency=lot.currency or "USD",
        auction_date=lot.auctionDate or "",
        region=lot.region or "",
        source=lot.source or "",
        created_at=created_at,
    )


@router.get("/favorites", response_model=list[FavoriteLotOut])
def list_favorites(user: Annotated[UserOut, Depends(get_current_user)]) -> list[FavoriteLotOut]:
    out: list[FavoriteLotOut] = []
    for lot_id, created_at in cabinet_store.list_favorite_ids(user.id):
        item = _favorite_out(lot_id, created_at)
        if item:
            out.append(item)
        else:
            # Drop stale refs silently
            cabinet_store.remove_favorite(user.id, lot_id)
    return out


@router.get("/favorites/ids")
def list_favorite_ids(user: Annotated[UserOut, Depends(get_current_user)]) -> dict[str, list[str]]:
    return {"ids": [lot_id for lot_id, _ in cabinet_store.list_favorite_ids(user.id)]}


@router.post("/favorites", response_model=FavoriteLotOut)
def add_favorite(
    body: FavoriteCreate,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> FavoriteLotOut:
    lot_id = _resolve_lot_id(body.lot_id)
    if not lot_id:
        raise HTTPException(status_code=404, detail="Lot not found")
    cabinet_store.add_favorite(user.id, lot_id)
    item = _favorite_out(lot_id, "")
    if not item:
        raise HTTPException(status_code=404, detail="Lot not found")
    # refresh created_at from db
    for lid, created in cabinet_store.list_favorite_ids(user.id):
        if lid == lot_id:
            item.created_at = created
            break
    return item


@router.delete("/favorites/{lot_id}")
def remove_favorite(
    lot_id: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> dict[str, bool]:
    resolved = _resolve_lot_id(lot_id) or lot_id.strip()
    ok = cabinet_store.remove_favorite(user.id, resolved)
    if not ok:
        # try raw id
        ok = cabinet_store.remove_favorite(user.id, lot_id.strip())
    if not ok:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"deleted": True}


@router.get("/admin/users", response_model=list[UserOut])
def admin_list_users(
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> list[UserOut]:
    return cabinet_store.list_users()


@router.get("/admin/deals", response_model=list[DealOut])
def admin_list_deals(
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> list[DealOut]:
    return cabinet_store.list_all_deals()


@router.post("/admin/deals", response_model=DealOut)
def admin_create_deal(
    body: DealCreate,
    admin: Annotated[UserOut, Depends(require_admin_or_key)],
) -> DealOut:
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title required")
    if body.origin_region not in ("usa", "uk", "china", "korea"):
        raise HTTPException(status_code=422, detail="invalid origin_region")
    try:
        return cabinet_store.create_deal(
            body,
            created_by_user_id=admin.id if admin.id else None,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Клиент не найден — пусть войдёт в кабинет") from exc


@router.patch("/admin/deals/{deal_id}", response_model=DealOut)
def admin_update_deal(
    deal_id: int,
    body: DealUpdate,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> DealOut:
    deal = cabinet_store.update_deal(deal_id, body)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post("/admin/deals/{deal_id}/payment", response_model=DealOut)
def admin_update_payment(
    deal_id: int,
    body: PaymentStageUpdate,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> DealOut:
    try:
        deal = cabinet_store.update_payment_stage(
            deal_id,
            stage=int(body.stage),
            paid=bool(body.paid),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post("/admin/deals/{deal_id}/stages/{stage_key}", response_model=DealOut)
def admin_update_stage(
    deal_id: int,
    stage_key: StageKey,
    body: StageUpdate,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> DealOut:
    if stage_key not in STAGE_KEYS:
        raise HTTPException(status_code=422, detail="Invalid stage")
    deal = cabinet_store.update_stage(deal_id, stage_key, body)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post("/admin/deals/{deal_id}/media", response_model=DealMediaOut)
async def admin_upload_media(
    deal_id: int,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
    file: UploadFile = File(...),
    kind: Literal["photo", "document"] = Form("photo"),
    stage_key: StageKey | None = Form(None),
    caption: str = Form(""),
) -> DealMediaOut:
    if cabinet_store.get_deal(deal_id) is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Empty file")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 25MB)")
    try:
        return cabinet_store.add_media(
            deal_id=deal_id,
            kind=kind,  # type: ignore[arg-type]
            content=content,
            filename=file.filename or "file",
            stage_key=stage_key,
            caption=caption,
            content_type=file.content_type or "",
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Deal not found") from exc


@router.get("/media/{media_id}")
def get_media(
    media_id: int,
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[UserOut | None, Depends(get_optional_user)] = None,
    access_token: str | None = Query(None),
) -> FileResponse:
    viewer = user
    if viewer is None and access_token:
        from app.services.auth_deps import decode_access_token

        payload = decode_access_token(access_token, settings)
        telegram_id = int(payload["sub"])
        viewer = cabinet_store.get_user_by_telegram_id(telegram_id)
    if viewer is None:
        raise HTTPException(status_code=401, detail="Auth required")

    info = cabinet_store.get_media_file(media_id)
    if not info:
        raise HTTPException(status_code=404, detail="Media not found")
    if not viewer.is_admin and not cabinet_store.media_belongs_to_user(media_id, viewer.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    path, filename, kind = info
    media_type = mimetypes.guess_type(filename)[0] or (
        "image/jpeg" if kind == "photo" else "application/octet-stream"
    )
    return FileResponse(
        path,
        media_type=media_type,
        filename=filename,
        content_disposition_type="inline" if kind == "photo" else "attachment",
    )
