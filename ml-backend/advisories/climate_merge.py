"""Observed vs forecast climate merge with GDD-style discipline.

Historical days use observed sensor data only (when coverage adequate).
Forecast fills only days strictly after the last observed day.
Never backfill historical gaps with forecast data.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from advisories.constants import MIN_OBSERVED_COVERAGE_HOURS
from day_night import ensure_aware_utc, local_day_key, resolve_zone


@dataclass(frozen=True)
class HourlyClimate:
    at: datetime
    temp_c: float | None
    rh_pct: float | None
    precip_mm: float | None
    source: str  # observed | forecast


@dataclass(frozen=True)
class DailyClimate:
    day: str
    t_max_c: float | None
    t_min_c: float | None
    rh_mean_pct: float | None
    wet_hours: int
    precip_sum_mm: float
    source: str  # observed | forecast | unavailable
    coverage_hours: int


def _parse_at(raw: Any) -> datetime | None:
    if isinstance(raw, datetime):
        return ensure_aware_utc(raw)
    if isinstance(raw, str):
        return ensure_aware_utc(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    return None


def _num(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def last_observed_day(
    readings: list[dict[str, Any]],
    tz_name: str,
) -> str | None:
    """Latest local day with adequate ambient temp+RH coverage."""
    hours_by_day: dict[str, set[int]] = {}
    for row in readings:
        at = _parse_at(row.get("recorded_at"))
        if at is None:
            continue
        if row.get("ambient_temp_c") is None and row.get("ambient_humidity_pct") is None:
            continue
        day = local_day_key(at, tz_name)
        hour = at.astimezone(resolve_zone(tz_name)).hour
        hours_by_day.setdefault(day, set()).add(hour)
    eligible = [
        day
        for day, hours in hours_by_day.items()
        if len(hours) >= MIN_OBSERVED_COVERAGE_HOURS
    ]
    return max(eligible) if eligible else None


def build_daily_climate_series(
    readings: list[dict[str, Any]],
    forecast_rows: list[dict[str, Any]],
    tz_name: str,
    *,
    now: datetime,
    rh_wet_threshold: float = 88.0,
) -> list[DailyClimate]:
    """Merge observed history and forward forecast into daily buckets."""
    at = ensure_aware_utc(now)
    today = local_day_key(at, tz_name)
    last_obs = last_observed_day(readings, tz_name)

    observed_by_day: dict[str, list[dict[str, Any]]] = {}
    for row in readings:
        recorded = _parse_at(row.get("recorded_at"))
        if recorded is None:
            continue
        day = local_day_key(recorded, tz_name)
        observed_by_day.setdefault(day, []).append(row)

    forecast_by_day: dict[str, list[dict[str, Any]]] = {}
    for row in forecast_rows:
        ft = _parse_at(row.get("forecast_time"))
        if ft is None:
            continue
        day = local_day_key(ft, tz_name)
        forecast_by_day.setdefault(day, []).append(row)

    all_days = sorted(set(observed_by_day.keys()) | set(forecast_by_day.keys()))
    if not all_days:
        return []

    series: list[DailyClimate] = []
    for day in all_days:
        use_observed = last_obs is not None and day <= last_obs
        use_forecast = last_obs is not None and day > last_obs
        if last_obs is None and day >= today:
            use_forecast = True
            use_observed = False
        if last_obs is None and day < today:
            use_observed = True
            use_forecast = False

        if use_observed:
            rows = observed_by_day.get(day, [])
            temps = [_num(r.get("ambient_temp_c")) for r in rows]
            temps = [t for t in temps if t is not None]
            rhs = [_num(r.get("ambient_humidity_pct")) for r in rows]
            rhs_clean = [r for r in rhs if r is not None]
            hours = {
                _parse_at(r.get("recorded_at"))
                for r in rows
                if _parse_at(r.get("recorded_at")) is not None
            }
            coverage = len(
                {
                    local_day_key(h, tz_name) + str(h.hour)
                    for h in hours
                    if h is not None
                }
            )
            wet = sum(1 for r in rhs_clean if r >= rh_wet_threshold)
            if coverage < MIN_OBSERVED_COVERAGE_HOURS:
                series.append(
                    DailyClimate(
                        day=day,
                        t_max_c=None,
                        t_min_c=None,
                        rh_mean_pct=None,
                        wet_hours=0,
                        precip_sum_mm=0.0,
                        source="unavailable",
                        coverage_hours=coverage,
                    )
                )
                continue
            series.append(
                DailyClimate(
                    day=day,
                    t_max_c=max(temps) if temps else None,
                    t_min_c=min(temps) if temps else None,
                    rh_mean_pct=(
                        sum(rhs_clean) / len(rhs_clean) if rhs_clean else None
                    ),
                    wet_hours=wet,
                    precip_sum_mm=0.0,
                    source="observed",
                    coverage_hours=coverage,
                )
            )
        elif use_forecast:
            rows = forecast_by_day.get(day, [])
            temps = [_num(r.get("temperature_2m")) for r in rows]
            temps = [t for t in temps if t is not None]
            rhs = [_num(r.get("relative_humidity_2m")) for r in rows]
            rhs_clean = [r for r in rhs if r is not None]
            precips = [_num(r.get("precipitation")) or 0.0 for r in rows]
            wet = sum(
                1
                for r in rows
                if (_num(r.get("relative_humidity_2m")) or 0) >= rh_wet_threshold
            )
            series.append(
                DailyClimate(
                    day=day,
                    t_max_c=max(temps) if temps else None,
                    t_min_c=min(temps) if temps else None,
                    rh_mean_pct=(
                        sum(rhs_clean) / len(rhs_clean) if rhs_clean else None
                    ),
                    wet_hours=wet,
                    precip_sum_mm=sum(precips),
                    source="forecast",
                    coverage_hours=len(rows),
                )
            )
        else:
            series.append(
                DailyClimate(
                    day=day,
                    t_max_c=None,
                    t_min_c=None,
                    rh_mean_pct=None,
                    wet_hours=0,
                    precip_sum_mm=0.0,
                    source="unavailable",
                    coverage_hours=0,
                )
            )
    return series


def days_to_commit(
    last_computed_day: str | None,
    today_local: str,
) -> list[str]:
    """Closed local days eligible for DSV commit (strictly before today).

    Strategy: skip open day — mid-day re-runs never double-count today.
    """
    if today_local <= "1970-01-01":
        return []
    start = (
        datetime.fromisoformat(last_computed_day) + timedelta(days=1)
        if last_computed_day
        else datetime.fromisoformat("1970-01-01")
    )
    end = datetime.fromisoformat(today_local) - timedelta(days=1)
    if start > end:
        return []
    days: list[str] = []
    cur = start
    while cur <= end:
        days.append(cur.date().isoformat())
        cur += timedelta(days=1)
    return days
