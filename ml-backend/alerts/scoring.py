"""Profile-aware metric scoring for alert rules (mirrors desktop metrics.ts)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from constants import ScoringSemantic, get_crop_stage, get_scoring_semantic

MetricKey = Literal[
    "moisture_pct",
    "ph",
    "soil_temp_c",
    "ambient_temp_c",
    "ambient_humidity_pct",
]

SCORED_KEYS: tuple[MetricKey, ...] = (
    "moisture_pct",
    "ph",
    "soil_temp_c",
    "ambient_temp_c",
    "ambient_humidity_pct",
)

WATCH_FRACTION = 0.1

MetricStatus = Literal["ok", "watch", "warn", "elevated", "unknown"]


@dataclass(frozen=True)
class MetricBounds:
    min: float
    max: float


@dataclass(frozen=True)
class MetricScore:
    status: MetricStatus
    bounds: MetricBounds | None
    position: float | None
    toward_bound: Literal["low", "high"] | None = None


def _stage_bounds(
    key: MetricKey,
    stage: dict[str, Any],
    recorded_at: datetime | None,
) -> MetricBounds | None:
    if key == "moisture_pct":
        lo = stage.get("moisture_min_pct")
        hi = stage.get("moisture_max_pct")
        if lo is None or hi is None:
            return None
        return MetricBounds(float(lo), float(hi))

    if key == "ph":
        lo = stage.get("ph_min")
        hi = stage.get("ph_max")
        if lo is None or hi is None:
            return None
        return MetricBounds(float(lo), float(hi))

    if key == "soil_temp_c":
        lo = stage.get("soil_temp_ideal_min_c")
        hi = stage.get("soil_temp_ideal_max_c")
        if lo is None or hi is None:
            return None
        return MetricBounds(float(lo), float(hi))

    if key == "ambient_humidity_pct":
        lo = stage.get("humidity_min_pct")
        hi = stage.get("humidity_max_pct")
        if lo is None or hi is None:
            return None
        return MetricBounds(float(lo), float(hi))

    if key == "ambient_temp_c":
        day_lo = stage.get("ambient_temp_day_min_c")
        day_hi = stage.get("ambient_temp_day_max_c")
        night_lo = stage.get("ambient_temp_night_min_c")
        night_hi = stage.get("ambient_temp_night_max_c")
        if None in (day_lo, day_hi, night_lo, night_hi) or recorded_at is None:
            return None
        hour = recorded_at.hour if recorded_at.tzinfo else recorded_at.hour
        # Match desktop: local hour from the datetime as stored (UTC).
        is_day = 6 <= hour < 18
        if is_day:
            return MetricBounds(float(day_lo), float(day_hi))
        return MetricBounds(float(night_lo), float(night_hi))

    return None


def get_metric_bounds(
    key: MetricKey,
    crop_type: str | None,
    lifecycle_stage: str | None,
    recorded_at: datetime | None = None,
) -> MetricBounds | None:
    stage = get_crop_stage(crop_type, lifecycle_stage)
    return _stage_bounds(key, stage, recorded_at)


def score_metric_value(
    value: float | None,
    bounds: MetricBounds | None,
    scoring_semantic: str,
) -> MetricScore:
    if value is None:
        return MetricScore("unknown", bounds, None)
    if bounds is None:
        return MetricScore("unknown", None, None)

    width = bounds.max - bounds.min
    position = 0.5 if width == 0 else (value - bounds.min) / width
    watch_margin = width * WATCH_FRACTION

    if scoring_semantic == ScoringSemantic.RESTRAINT.value:
        if value > bounds.max:
            return MetricScore("elevated", bounds, position, "high")
        if value >= bounds.max - watch_margin:
            return MetricScore("watch", bounds, position, "high")
        return MetricScore("ok", bounds, position)

    if value < bounds.min or value > bounds.max:
        toward: Literal["low", "high"] = "low" if value < bounds.min else "high"
        return MetricScore("warn", bounds, position, toward)
    if value <= bounds.min + watch_margin:
        return MetricScore("watch", bounds, position, "low")
    if value >= bounds.max - watch_margin:
        return MetricScore("watch", bounds, position, "high")
    return MetricScore("ok", bounds, position)


def score_reading_metric(
    reading: dict[str, Any],
    key: MetricKey,
    crop_type: str | None,
    lifecycle_stage: str | None,
) -> MetricScore:
    raw = reading.get(key)
    value = float(raw) if raw is not None else None
    recorded_at = reading.get("recorded_at")
    if isinstance(recorded_at, str):
        from datetime import datetime as dt

        recorded_at = dt.fromisoformat(recorded_at.replace("Z", "+00:00"))
    bounds = get_metric_bounds(key, crop_type, lifecycle_stage, recorded_at)
    semantic = get_scoring_semantic(crop_type, lifecycle_stage)
    return score_metric_value(value, bounds, semantic)


def reading_profile(
    reading: dict[str, Any],
    device_crop: str,
    device_stage: str,
) -> tuple[str, str]:
    crop = reading.get("crop_type_at_reading") or device_crop
    stage = reading.get("lifecycle_stage_at_reading") or device_stage
    return str(crop), str(stage)
