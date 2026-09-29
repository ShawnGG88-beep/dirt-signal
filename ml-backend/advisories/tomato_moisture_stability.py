"""Tomato moisture stability and cracking/BER risk."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from advisories.climate_merge import DailyClimate
from advisories.constants import (
    MOISTURE_DEPLETION_FRACTION,
    MOISTURE_ROLLING_DAYS,
    MOISTURE_WEEKLY_MM_MAX,
    MOISTURE_WEEKLY_MM_MIN,
    MOISTURE_WEEKLY_NOTE,
    SOIL_TEXTURE_DEPLETION_PCT,
    SOIL_TEXTURE_PROVENANCE,
)
from constants import get_crop_stage


@dataclass(frozen=True)
class MoistureStabilityAssessment:
    depletion_threshold_pct: float
    consecutive_dry_days: int
    swing_count: int
    cracking_risk: bool
    headline: str
    weekly_context: str
    provenance: str


def depletion_threshold_pct(
    crop_type: str,
    lifecycle_stage: str,
    soil_texture: str | None,
) -> float:
    stage = get_crop_stage(crop_type, lifecycle_stage)
    upper = float(stage.get("moisture_max_pct", 80.0))
    texture_floor = SOIL_TEXTURE_DEPLETION_PCT.get(soil_texture or "loam", 60.0)
    return max(texture_floor, upper * (1.0 - MOISTURE_DEPLETION_FRACTION))


def assess_moisture_stability(
    readings: list[dict[str, Any]],
    daily_series: list[DailyClimate],
    forecast_rows: list[dict[str, Any]],
    *,
    crop_type: str,
    lifecycle_stage: str,
    soil_texture: str | None,
    dry_streak_days: int = 3,
    precip_prob_pct: float = 50.0,
    precip_mm: float = 5.0,
    now: datetime | None = None,
) -> MoistureStabilityAssessment:
    threshold = depletion_threshold_pct(crop_type, lifecycle_stage, soil_texture)
    stage = get_crop_stage(crop_type, lifecycle_stage)
    upper = float(stage.get("moisture_max_pct", 80.0))

    moistures = [
        (r.get("recorded_at"), float(r["moisture_pct"]))
        for r in readings
        if r.get("moisture_pct") is not None
    ]
    moistures.sort(key=lambda m: str(m[0]))

    consecutive_dry = 0
    max_dry = 0
    swing_count = 0
    prev_below = False
    for _, moisture in moistures[-500:]:
        below = moisture < threshold
        if below:
            consecutive_dry += 1
            max_dry = max(max_dry, consecutive_dry)
        else:
            consecutive_dry = 0
        if below and moisture > upper * 0.95:
            swing_count += 1
        prev_below = below

    at = now or datetime.now(timezone.utc)
    influx = _forecast_influx(forecast_rows, at, precip_prob_pct, precip_mm)

    cracking = max_dry >= dry_streak_days and influx
    headline = (
        "Cracking/blossom-end-rot risk: heavy moisture influx forecast after a dry stretch."
        if cracking
        else "No cracking/BER influx risk detected."
    )

    return MoistureStabilityAssessment(
        depletion_threshold_pct=threshold,
        consecutive_dry_days=max_dry,
        swing_count=swing_count,
        cracking_risk=cracking,
        headline=headline,
        weekly_context=(
            f"Reference {MOISTURE_WEEKLY_MM_MIN:.0f}-{MOISTURE_WEEKLY_MM_MAX:.0f} mm/week "
            f"during fruit development ({MOISTURE_WEEKLY_NOTE})."
        ),
        provenance=SOIL_TEXTURE_PROVENANCE,
    )


def _forecast_influx(
    forecast_rows: list[dict[str, Any]],
    now: datetime,
    precip_prob_pct: float,
    precip_mm: float,
) -> bool:
    end = now + timedelta(hours=48)
    daily_precip = 0.0
    for row in forecast_rows:
        ft = row.get("forecast_time")
        if ft is None:
            continue
        at = datetime.fromisoformat(str(ft).replace("Z", "+00:00"))
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        if at < now or at > end:
            continue
        prob = float(row.get("precipitation_probability") or 0)
        if prob >= precip_prob_pct:
            return True
        daily_precip += float(row.get("precipitation") or 0)
    return daily_precip >= precip_mm
