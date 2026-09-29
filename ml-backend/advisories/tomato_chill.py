"""Tomato forecast chill, frost and blossom-drop assessment."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from advisories.constants import (
    CHILL_CONSECUTIVE_HOURS,
    TOMATO_BLOSSOM_DROP_C,
    TOMATO_CHILL_MAX_C,
    TOMATO_FROST_C,
    TOMATO_SLOW_GROWTH_MAX_C,
)
from day_night import ensure_aware_utc, is_night_period, local_day_key


@dataclass(frozen=True)
class ChillNight:
    date: str
    low_c: float
    tier: str


@dataclass(frozen=True)
class TomatoChillAssessment:
    nights: list[ChillNight]
    highest_tier: str | None
    message: str


def _num(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def assess_tomato_chill(
    forecast_rows: list[dict[str, Any]],
    tz_name: str,
    *,
    lifecycle_stage: str,
    now: datetime | None = None,
) -> TomatoChillAssessment:
    at = ensure_aware_utc(now or datetime.now(timezone.utc))
    by_night: dict[str, list[float]] = {}
    hour_temps: list[tuple[datetime, float]] = []

    for row in forecast_rows:
        ft = row.get("forecast_time")
        temp = _num(row.get("temperature_2m"))
        if ft is None or temp is None:
            continue
        recorded = ensure_aware_utc(datetime.fromisoformat(str(ft).replace("Z", "+00:00")))
        if not is_night_period(recorded, tz_name):
            continue
        day = local_day_key(recorded, tz_name)
        by_night.setdefault(day, []).append(temp)
        hour_temps.append((recorded, temp))

    nights: list[ChillNight] = []
    for day, temps in sorted(by_night.items()):
        low = min(temps)
        tier = _tier_for_low(low, lifecycle_stage)
        if tier:
            nights.append(ChillNight(date=day, low_c=low, tier=tier))

    highest = _max_tier(n.tier for n in nights) if nights else None
    if not nights:
        return TomatoChillAssessment(
            nights=[],
            highest_tier=None,
            message="No chill, frost or blossom-drop risk in the forecast window.",
        )
    parts = [f"{n.date}: {n.low_c:.1f}°C ({n.tier})" for n in nights]
    return TomatoChillAssessment(
        nights=nights,
        highest_tier=highest,
        message="Forecast nights at risk: " + "; ".join(parts),
    )


def _tier_for_low(low_c: float, lifecycle_stage: str) -> str | None:
    if low_c <= TOMATO_FROST_C:
        return "frost"
    if lifecycle_stage == "flowering" and low_c <= TOMATO_BLOSSOM_DROP_C:
        return "blossom_drop"
    if low_c <= TOMATO_CHILL_MAX_C:
        return "chilling"
    if low_c <= TOMATO_SLOW_GROWTH_MAX_C:
        return "slow_growth"
    return None


def _max_tier(tiers: Any) -> str | None:
    order = ["frost", "chilling", "blossom_drop", "slow_growth"]
    best: str | None = None
    for tier in tiers:
        if best is None or order.index(tier) < order.index(best):
            best = tier
    return best
