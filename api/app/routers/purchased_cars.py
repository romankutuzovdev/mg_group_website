from __future__ import annotations

import mimetypes
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.models.cabinet import UserOut
from app.services.auth_deps import require_admin_or_key
from app.services.purchased_cars_store import (
    PurchasedCarCreate,
    PurchasedCarOut,
    PurchasedCarUpdate,
    purchased_cars_store,
)

router = APIRouter(tags=["purchased-cars"])


@router.get("/purchased-cars", response_model=dict)
def list_purchased_cars(limit: int = Query(24, ge=1, le=100)) -> dict:
    """Public showcase of whole cars added by managers."""
    items = purchased_cars_store.list_public(limit=limit)
    return {"items": [i.model_dump() for i in items], "count": len(items)}


@router.get("/purchased-cars/{car_id}", response_model=PurchasedCarOut)
def get_purchased_car(car_id: str) -> PurchasedCarOut:
    car = purchased_cars_store.get(car_id)
    if not car or not car.published:
        raise HTTPException(status_code=404, detail="Not found")
    return car


@router.get("/purchased-cars/{car_id}/image")
def purchased_car_image(car_id: str) -> FileResponse:
    info = purchased_cars_store.get_image_file(car_id)
    if not info:
        raise HTTPException(status_code=404, detail="Image not found")
    path, filename = info
    media_type = mimetypes.guess_type(filename)[0] or "image/jpeg"
    return FileResponse(path, media_type=media_type, filename=filename)


@router.get("/admin/purchased-cars", response_model=dict)
def admin_list_purchased_cars(
    _: Annotated[UserOut, Depends(require_admin_or_key)],
    limit: int = Query(100, ge=1, le=200),
) -> dict:
    items = purchased_cars_store.list_all(limit=limit)
    return {"items": [i.model_dump() for i in items], "count": len(items)}


@router.post("/admin/purchased-cars", response_model=PurchasedCarOut)
def admin_create_purchased_car(
    body: PurchasedCarCreate,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> PurchasedCarOut:
    if not body.make.strip() or not body.model.strip():
        raise HTTPException(status_code=422, detail="make and model required")
    return purchased_cars_store.create(body)


@router.patch("/admin/purchased-cars/{car_id}", response_model=PurchasedCarOut)
def admin_update_purchased_car(
    car_id: str,
    body: PurchasedCarUpdate,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> PurchasedCarOut:
    car = purchased_cars_store.update(car_id, body)
    if not car:
        raise HTTPException(status_code=404, detail="Not found")
    return car


@router.delete("/admin/purchased-cars/{car_id}")
def admin_delete_purchased_car(
    car_id: str,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> dict:
    if not purchased_cars_store.delete(car_id):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.post("/admin/purchased-cars/{car_id}/photo", response_model=PurchasedCarOut)
async def admin_upload_purchased_car_photo(
    car_id: str,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
    file: UploadFile = File(...),
) -> PurchasedCarOut:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Empty file")
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 15MB)")
    car = purchased_cars_store.set_image(
        car_id,
        content=content,
        filename=file.filename or "photo.jpg",
    )
    if not car:
        raise HTTPException(status_code=404, detail="Not found")
    return car
