from fastapi import APIRouter

from app.data.store import lot_store
from app import __version__

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": __version__,
        "lots": len(lot_store),
    }
