"""Derived metrics: VPD, dew point, dry-down, high-humidity hours, GDD.

Pure functions, no I/O. Desktop mirrors in derived.ts; shared fixtures assert
identical results. Where a value is a proxy, callers must surface the matching
SAMPLING_LIMITATIONS note — never invent threshold bands without a source.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from day_night import local_day_key, local_hour

# ---------------------------------------------------------------------------
# Dry-down (moved from alerts/drydown.py — single implementation)
# ---------------------------------------------------------------------------

# Provisional: mock traces fit far more cleanly than a capacitive probe in real
# soil under a diurnal cycle. Re-tune against real sensor traces before treating
# this as a hard quality gate.
MIN_R_SQUARED = 0.7
MIN_SAMPLES = 4

HIGH_HUMIDITY_THRESHOLD_PCT = 85.0
# Days with fewer than this many distinct device-local hours sampled are
# incomplete and excluded from cumulative GDD.
MIN_COVERAGE_HOURS = 18

DEFAULT_GDD_BASE_C = 10.0


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


def vapour_pressure_deficit_kpa(
    ambient_temp_c: float | None,
    ambient_humidity_pct: float | None,
) -> float | None:
    """Air VPD (kPa). Null if either input is null — never interpolate.

    Assumes leaf temperature equals air temperature — weakest under artificial
    lighting and still air.
    """
    if ambient_temp_c is None or ambient_humidity_pct is None:
        return None
    t = float(ambient_temp_c)
    rh = float(ambient_humidity_pct)
    es = 0.6108 * math.exp(17.27 * t / (t + 237.3))
    return es * (1.0 - rh / 100.0)


def dew_point_c(
    ambient_temp_c: float | None,
    ambient_humidity_pct: float | None,
) -> float | None:
    """Dew point (°C). Null if either input is null — never interpolate."""
    if ambient_temp_c is None or ambient_humidity_pct is None:
        return None
    t = float(ambient_temp_c)
    rh = float(ambient_humidity_pct)
    if rh <= 0:
        return None
    a = math.log(rh / 100.0) + 17.27 * t / (t + 237.3)
    denom = 17.27 - a
    if abs(denom) < 1e-12:
        return None
    return 237.3 * a / denom


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


@dataclass(frozen=True)
class HighHumidityDay:
    """Proxy leaf-wetness duration for one device-local calendar day."""

    day: str
    high_humidity_hours: int
    coverage_hours: int
    incomplete: bool


def high_humidity_hours_by_day(
    readings: list[dict[str, Any]],
    tz_name: str,
    *,
    threshold_pct: float = HIGH_HUMIDITY_THRESHOLD_PCT,
    min_coverage_hours: int = MIN_COVERAGE_HOURS,
) -> list[HighHumidityDay]:
    """Count distinct device-local hours above threshold per calendar day.

    Proxy for leaf wetness duration — never a disease risk score. Never
    interpolates across gaps.
    """
    hours_by_day: dict[str, set[int]] = {}
    high_by_day: dict[str, set[int]] = {}

    for reading in readings:
        at = _parse_at(reading.get("recorded_at"))
        if at is None:
            continue
        day = local_day_key(at, tz_name)
        hour = local_hour(at, tz_name)
        hours_by_day.setdefault(day, set()).add(hour)
        hum = reading.get("ambient_humidity_pct")
        if hum is not None and float(hum) >= threshold_pct:
            high_by_day.setdefault(day, set()).add(hour)

    days = sorted(hours_by_day.keys())
    return [
        HighHumidityDay(
            day=day,
            high_humidity_hours=len(high_by_day.get(day, set())),
            coverage_hours=len(hours_by_day[day]),
            incomplete=len(hours_by_day[day]) < min_coverage_hours,
        )
        for day in days
    ]


def gdd_day(
    t_max_c: float | None,
    t_min_c: float | None,
    *,
    base_c: float = DEFAULT_GDD_BASE_C,
) -> float | None:
    """Single-triangle growing degree day. Null if either extreme is null."""
    if t_max_c is None or t_min_c is None:
        return None
    return max(0.0, (float(t_max_c) + float(t_min_c)) / 2.0 - float(base_c))


@dataclass(frozen=True)
class CumulativeGdd:
    cumulative_gdd: float | None
    days_elapsed: int | None
    days_excluded: int
    unavailable_reason: Literal["no_season_start", None]


def cumulative_gdd(
    daily_gdd: list[tuple[str, float | None, bool]],
    *,
    season_start_date: str | None,
) -> CumulativeGdd:
    """Sum complete days from season_start inclusive.

    daily_gdd entries: (YYYY-MM-DD, gdd_day | None, incomplete).
    Incomplete days and null gdd_day are excluded and counted.
    """
    if not season_start_date:
        return CumulativeGdd(None, None, 0, "no_season_start")

    total = 0.0
    elapsed = 0
    excluded = 0
    for day, value, incomplete in daily_gdd:
        if day < season_start_date:
            continue
        elapsed += 1
        if incomplete or value is None:
            excluded += 1
            continue
        total += float(value)
    return CumulativeGdd(total, elapsed, excluded, None)
