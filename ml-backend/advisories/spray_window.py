"""Crop-agnostic spray/treatment timing window."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from advisories.constants import (
    SPRAY_HORIZON_HOURS,
    SPRAY_PRECIP_PROB_MAX,
    SPRAY_WIND_DRIFT_MAX_KMH,
    SPRAY_WIND_DRIFT_PROVENANCE,
)


@dataclass(frozen=True)
class SprayWindowResult:
    found: bool
    window_start: str | None
    window_end: str | None
    message: str
    provenance: str


def _num(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _parse_at(raw: Any) -> datetime | None:
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, str):
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return None


def find_spray_window(
    forecast_rows: list[dict[str, Any]],
    *,
    now: datetime | None = None,
    horizon_hours: int = SPRAY_HORIZON_HOURS,
) -> SprayWindowResult:
    at = now or datetime.now(timezone.utc)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    end = at + timedelta(hours=horizon_hours)

    hours: list[tuple[datetime, bool]] = []
    for row in forecast_rows:
        ft = _parse_at(row.get("forecast_time"))
        if ft is None or ft < at or ft > end:
            continue
        precip_prob = _num(row.get("precipitation_probability")) or 100.0
        wind = _num(row.get("wind_speed_10m")) or 999.0
        ok = precip_prob < SPRAY_PRECIP_PROB_MAX and wind < SPRAY_WIND_DRIFT_MAX_KMH
        hours.append((ft, ok))

    hours.sort(key=lambda h: h[0])
    if not hours:
        return SprayWindowResult(
            found=False,
            window_start=None,
            window_end=None,
            message="No suitable spray window in the next 48 hours (no forecast data).",
            provenance=SPRAY_WIND_DRIFT_PROVENANCE,
        )

    best_start: datetime | None = None
    best_end: datetime | None = None
    best_len = 0
    cur_start: datetime | None = None
    cur_end: datetime | None = None
    cur_len = 0

    for ft, ok in hours:
        if ok:
            if cur_start is None:
                cur_start = ft
            cur_end = ft
            cur_len += 1
        else:
            if cur_len > best_len and cur_start and cur_end:
                best_start, best_end, best_len = cur_start, cur_end, cur_len
            cur_start = cur_end = None
            cur_len = 0
    if cur_len > best_len and cur_start and cur_end:
        best_start, best_end, best_len = cur_start, cur_end, cur_len

    if best_start is None or best_end is None or best_len == 0:
        return SprayWindowResult(
            found=False,
            window_start=None,
            window_end=None,
            message="No suitable spray window in the next 48 hours.",
            provenance=SPRAY_WIND_DRIFT_PROVENANCE,
        )

    return SprayWindowResult(
        found=True,
        window_start=best_start.isoformat(),
        window_end=(best_end + timedelta(hours=1)).isoformat(),
        message=(
            f"Next suitable spray window: {best_start.isoformat()} to "
            f"{(best_end + timedelta(hours=1)).isoformat()} "
            f"(precipitation probability <{SPRAY_PRECIP_PROB_MAX:.0f}%, "
            f"wind <{SPRAY_WIND_DRIFT_MAX_KMH:.0f} km/h)."
        ),
        provenance=SPRAY_WIND_DRIFT_PROVENANCE,
    )
