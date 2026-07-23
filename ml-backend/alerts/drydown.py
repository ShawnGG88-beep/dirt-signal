"""Dry-down moisture projection for irrigation_due.

This lives outside the alert rule evaluator so irrigation_due never invents
a projection the derived layer declined to produce. Suppression conditions
are conservative: prefer no alert over a bad projection.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class DryDownProjection:
    """Linear dry-down fit after the last irrigation event."""

    hours_to_lower_bound: float
    slope_pct_per_hour: float
    intercept_pct: float
    r_squared: float
    moisture_lower_bound: float
    segment_start: datetime
    sample_count: int


@dataclass(frozen=True)
class DryDownResult:
    projection: DryDownProjection | None
    suppressed_reason: str | None


MIN_SAMPLES = 4
MIN_R_SQUARED = 0.5


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_at(raw: Any) -> datetime | None:
    if isinstance(raw, datetime):
        return _ensure_utc(raw)
    if isinstance(raw, str):
        return _ensure_utc(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    return None


def project_drydown(
    readings: list[dict[str, Any]],
    events: list[dict[str, Any]],
    *,
    moisture_lower_bound: float | None,
    now: datetime | None = None,
) -> DryDownResult:
    """Project hours until moisture reaches the lower bound.

    Suppresses (returns projection=None) when:
    - no moisture lower bound
    - no irrigation event to anchor the segment
    - segment contains sensor_maintenance
    - fewer than MIN_SAMPLES with moisture
    - slope is non-negative (not drying)
    - linear fit r² below MIN_R_SQUARED
    """
    if moisture_lower_bound is None:
        return DryDownResult(None, "no_moisture_lower_bound")

    now = _ensure_utc(now or datetime.now(timezone.utc))

    irrigations = [
        e
        for e in events
        if e.get("event_type") == "irrigation" and _parse_at(e.get("occurred_at"))
    ]
    if not irrigations:
        return DryDownResult(None, "missing_irrigation_event")

    irrigations.sort(key=lambda e: _parse_at(e["occurred_at"]) or now)
    last_irrigation_at = _parse_at(irrigations[-1]["occurred_at"])
    assert last_irrigation_at is not None

    maintenance = [
        e
        for e in events
        if e.get("event_type") == "sensor_maintenance"
        and (_parse_at(e.get("occurred_at")) or now) >= last_irrigation_at
    ]
    if maintenance:
        return DryDownResult(None, "sensor_maintenance_in_segment")

    points: list[tuple[float, float]] = []
    for reading in readings:
        at = _parse_at(reading.get("recorded_at"))
        moisture = reading.get("moisture_pct")
        if at is None or moisture is None:
            continue
        if at < last_irrigation_at:
            continue
        hours = (at - last_irrigation_at).total_seconds() / 3600.0
        points.append((hours, float(moisture)))

    if len(points) < MIN_SAMPLES:
        return DryDownResult(None, "insufficient_samples")

    # Ordinary least squares: moisture = intercept + slope * hours
    n = len(points)
    mean_x = sum(p[0] for p in points) / n
    mean_y = sum(p[1] for p in points) / n
    ss_xx = sum((p[0] - mean_x) ** 2 for p in points)
    ss_yy = sum((p[1] - mean_y) ** 2 for p in points)
    ss_xy = sum((p[0] - mean_x) * (p[1] - mean_y) for p in points)

    if ss_xx <= 0:
        return DryDownResult(None, "poor_fit")

    slope = ss_xy / ss_xx
    intercept = mean_y - slope * mean_x

    if slope >= 0:
        return DryDownResult(None, "non_negative_slope")

    ss_res = sum((p[1] - (intercept + slope * p[0])) ** 2 for p in points)
    r_squared = 1.0 - (ss_res / ss_yy) if ss_yy > 0 else 0.0
    if r_squared < MIN_R_SQUARED:
        return DryDownResult(None, "poor_fit")

    # Solve intercept + slope * hours = lower_bound
    hours_from_irrigation = (moisture_lower_bound - intercept) / slope
    hours_elapsed = (now - last_irrigation_at).total_seconds() / 3600.0
    hours_to_bound = hours_from_irrigation - hours_elapsed

    return DryDownResult(
        DryDownProjection(
            hours_to_lower_bound=hours_to_bound,
            slope_pct_per_hour=slope,
            intercept_pct=intercept,
            r_squared=r_squared,
            moisture_lower_bound=moisture_lower_bound,
            segment_start=last_irrigation_at,
            sample_count=n,
        ),
        None,
    )
