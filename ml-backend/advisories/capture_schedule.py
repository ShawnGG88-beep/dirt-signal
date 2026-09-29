"""NDVI capture scheduling suggestion (does not change Pi trigger)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from day_night import local_day_key, resolve_zone


@dataclass(frozen=True)
class CaptureSuggestion:
    suggested_at: str | None
    cloud_cover: float | None
    stability_label: str
    note: str


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


def suggest_capture_time(
    forecast_rows: list[dict[str, Any]],
    tz_name: str,
    *,
    light_condition: str = "unknown",
    now: datetime | None = None,
) -> CaptureSuggestion:
    at = now or datetime.now(timezone.utc)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    today = local_day_key(at, tz_name)

    candidates: list[tuple[datetime, float, float]] = []
    for row in forecast_rows:
        ft = _parse_at(row.get("forecast_time"))
        cc = _num(row.get("cloud_cover"))
        if ft is None or cc is None:
            continue
        if local_day_key(ft, tz_name) != today:
            continue
        local = ft.astimezone(resolve_zone(tz_name))
        if local.hour < 10 or local.hour > 15:
            continue
        # Stability: low variance in +/- 2h window
        window = [
            _num(r.get("cloud_cover"))
            for r in forecast_rows
            if _parse_at(r.get("forecast_time")) is not None
            and abs(
                (_parse_at(r.get("forecast_time")) - ft).total_seconds()
            )
            <= 7200
            and _num(r.get("cloud_cover")) is not None
        ]
        if len(window) < 2:
            continue
        mean = sum(window) / len(window)
        variance = sum((v - mean) ** 2 for v in window) / len(window)
        candidates.append((ft, cc, variance))

    if not candidates:
        return CaptureSuggestion(
            suggested_at=None,
            cloud_cover=None,
            stability_label="unavailable",
            note=(
                "No stable capture window near solar noon in today's forecast. "
                f"Light condition: {light_condition}."
            ),
        )

    candidates.sort(key=lambda c: (c[2], abs(c[1] - 50.0)))
    best_ft, best_cc, var = candidates[0]
    if best_cc < 30:
        label = "reliably clear"
    elif best_cc > 70:
        label = "reliably overcast"
    else:
        label = "mixed but stable"
    return CaptureSuggestion(
        suggested_at=best_ft.isoformat(),
        cloud_cover=best_cc,
        stability_label=label,
        note=(
            f"Suggested capture near solar noon ({label}, variance {var:.1f}). "
            f"Light condition: {light_condition}. Does not change the Pi schedule."
        ),
    )
