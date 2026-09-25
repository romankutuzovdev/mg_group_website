"""Auction date helpers — parse ISO dates and detect ended lots."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.lots import AuctionLot


def parse_auction_date(value: str | None) -> datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        # date-only → end of that UTC day
        if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
            return datetime.fromisoformat(raw).replace(
                hour=23, minute=59, second=59, tzinfo=timezone.utc
            )
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def is_auction_ended(
    lot: AuctionLot,
    *,
    now: datetime | None = None,
    grace_hours: float = 0,
) -> bool:
    """True when auctionDate is parseable and already past (plus grace).

    Lots without a parseable date are treated as still active (kept).
    """
    dt = parse_auction_date(lot.auctionDate)
    if dt is None:
        return False
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(hours=max(0.0, grace_hours))
    return dt < cutoff


def active_lots(
    lots: list[AuctionLot],
    *,
    now: datetime | None = None,
    grace_hours: float = 0,
) -> list[AuctionLot]:
    return [lot for lot in lots if not is_auction_ended(lot, now=now, grace_hours=grace_hours)]
