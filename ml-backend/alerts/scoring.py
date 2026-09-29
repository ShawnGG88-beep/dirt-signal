"""Profile-aware metric scoring for alert rules (mirrors desktop metrics.ts)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from constants import (
    ScoringSemantic,
    get_crop_stage,
    get_scoring_semantic,
    grape_root_zone_temp_zone,
    is_grape_crop,
)
from day_night import is_day_period

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
MetricUnscoredReason = Literal["no_value", "no_band", "needs_calibration"]


@dataclass(frozen=True)
class MetricBounds:
    min: float
    max: float


@dataclass(frozen=True)
class SoilMoistureAnchors:
    field_capacity_pct: float | None
    refill_point_pct: float | None


@dataclass(frozen=True)
class MetricScore:
    status: MetricStatus
    bounds: MetricBounds | None
    position: float | None
    toward_bound: Literal["low", "high"] | None = None
    reason: MetricUnscoredReason | None = None
    depletion_pct: float | None = None
    zone_id: str | None = None
    zone_label: str | None = None


def anchors_are_complete(anchors: SoilMoistureAnchors | None) -> bool:
    if anchors is None:
        return False
    fc = anchors.field_capacity_pct
    rp = anchors.refill_point_pct
    return (
        fc is not None
        and rp is not None
        and isinstance(fc, (int, float))
        and isinstance(rp, (int, float))
        and float(fc) > float(rp)
    )


def moisture_depletion_pct(
    value: float, anchors: SoilMoistureAnchors
) -> float | None:
    """Percent depletion: 0 at field capacity, 100 at refill point."""
    if not anchors_are_complete(anchors):
        return None
    assert anchors.field_capacity_pct is not None
    assert anchors.refill_point_pct is not None
    span = float(anchors.field_capacity_pct) - float(anchors.refill_point_pct)
    if span <= 0:
        return None
    return (float(anchors.field_capacity_pct) - value) / span * 100.0


def score_moisture_depletion(
    value: float | None,
    anchors: SoilMoistureAnchors | None,
) -> MetricScore:
    if value is None:
        return MetricScore("unknown", None, None, reason="no_value")
    if not anchors_are_complete(anchors) or anchors is None:
        return MetricScore("unknown", None, None, reason="needs_calibration")
    assert anchors.field_capacity_pct is not None
    assert anchors.refill_point_pct is not None
    fc = float(anchors.field_capacity_pct)
    rp = float(anchors.refill_point_pct)
    bounds = MetricBounds(rp, fc)
    width = bounds.max - bounds.min
    position = 0.5 if width == 0 else (value - bounds.min) / width
    watch_margin = width * WATCH_FRACTION
    depletion = moisture_depletion_pct(value, anchors)

    # Above field capacity: gravitational water, not plant-available.
    if value > fc:
        return MetricScore(
            "watch", bounds, position, "high", depletion_pct=depletion
        )
    if value <= rp:
        return MetricScore(
            "warn", bounds, position, "low", depletion_pct=depletion
        )
    if value <= rp + watch_margin:
        return MetricScore(
            "watch", bounds, position, "low", depletion_pct=depletion
        )
    return MetricScore("ok", bounds, position, depletion_pct=depletion)


def score_grape_soil_temp(value: float | None) -> MetricScore:
    """Graded zone scoring; bypasses restraint (cold soil is a real problem)."""
    if value is None:
        return MetricScore("unknown", None, None, reason="no_value")
    zone = grape_root_zone_temp_zone(value)
    # Zhang et al. 2024, Horticulturae 10(3):245: optimal 21-24°C
    bounds = MetricBounds(21.0, 24.0)
    width = bounds.max - bounds.min
    position = 0.5 if width == 0 else (value - bounds.min) / width
    severity = str(zone["severity"])
    status: MetricStatus = (
        severity if severity in ("ok", "watch", "warn") else "warn"
    )
    toward: Literal["low", "high"] | None = None
    if value < bounds.min:
        toward = "low"
    elif value > bounds.max:
        toward = "high"
    return MetricScore(
        status,
        bounds,
        position,
        toward,
        zone_id=str(zone["id"]),
        zone_label=str(zone["label"]),
    )


def _stage_bounds(
    key: MetricKey,
    stage: dict[str, Any],
    recorded_at: datetime | None,
    tz_name: str | None,
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
        if is_day_period(recorded_at, tz_name):
            return MetricBounds(float(day_lo), float(day_hi))
        return MetricBounds(float(night_lo), float(night_hi))

    return None


def get_metric_bounds(
    key: MetricKey,
    crop_type: str | None,
    lifecycle_stage: str | None,
    recorded_at: datetime | None = None,
    tz_name: str | None = None,
) -> MetricBounds | None:
    stage = get_crop_stage(crop_type, lifecycle_stage)
    return _stage_bounds(key, stage, recorded_at, tz_name)


def score_metric_value(
    value: float | None,
    bounds: MetricBounds | None,
    scoring_semantic: str,
) -> MetricScore:
    if value is None:
        return MetricScore("unknown", bounds, None, reason="no_value")
    if bounds is None:
        return MetricScore("unknown", None, None, reason="no_band")

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
    tz_name: str | None = None,
    anchors: SoilMoistureAnchors | None = None,
) -> MetricScore:
    raw = reading.get(key)
    value = float(raw) if raw is not None else None
    recorded_at = reading.get("recorded_at")
    if isinstance(recorded_at, str):
        from datetime import datetime as dt

        recorded_at = dt.fromisoformat(recorded_at.replace("Z", "+00:00"))

    if key == "soil_temp_c" and is_grape_crop(crop_type):
        return score_grape_soil_temp(value)

    if key == "moisture_pct":
        band = get_metric_bounds(
            key, crop_type, lifecycle_stage, recorded_at, tz_name
        )
        if band is not None:
            semantic = get_scoring_semantic(crop_type, lifecycle_stage)
            return score_metric_value(value, band, semantic)
        return score_moisture_depletion(value, anchors)

    bounds = get_metric_bounds(
        key, crop_type, lifecycle_stage, recorded_at, tz_name
    )
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


def device_anchors(device: dict[str, Any] | None) -> SoilMoistureAnchors | None:
    if not device:
        return None
    return SoilMoistureAnchors(
        field_capacity_pct=_optional_float(device.get("soil_field_capacity_raw")),
        refill_point_pct=_optional_float(device.get("soil_refill_point_raw")),
    )


def _optional_float(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None
