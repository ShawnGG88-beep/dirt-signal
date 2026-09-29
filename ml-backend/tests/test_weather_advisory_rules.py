"""Integration tests for tomato weather advisory rules."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from advisories.climate_merge import build_daily_climate_series, days_to_commit
from advisories.dsv import apply_daily_dsv
from advisories.tomato_early_blight import score_early_blight_day
from advisories.climate_merge import DailyClimate
from alerts.rules import EvalContext, Verdict, evaluate_forecast_chill_risk


def _forecast_row(at: datetime, temp_c: float) -> dict:
    return {
        "forecast_time": at.isoformat(),
        "temperature_2m": temp_c,
        "relative_humidity_2m": 80.0,
        "precipitation_probability": 10.0,
        "precipitation": 0.0,
        "wind_speed_10m": 5.0,
        "cloud_cover": 40.0,
    }


def test_days_to_commit_skips_open_day() -> None:
    days = days_to_commit("2026-08-20", "2026-08-23")
    assert days == ["2026-08-21", "2026-08-22"]
    assert "2026-08-23" not in days


def test_dsv_midday_idempotency() -> None:
    state = apply_daily_dsv(
        accumulated=10.0,
        threshold=15.0,
        daily_score=4.0,
        days_since_reset=2,
    )
    assert state.accumulated == 14.0
    again = apply_daily_dsv(
        accumulated=state.accumulated,
        threshold=15.0,
        daily_score=4.0,
        days_since_reset=state.days_since_reset,
    )
    assert again.accumulated == 0.0
    assert again.spray_recommended is True


def test_forecast_never_backfills_observed_gap() -> None:
    now = datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc)
    readings = [
        {
            "recorded_at": (now - timedelta(days=2, hours=1)).isoformat(),
            "ambient_temp_c": 22.0,
            "ambient_humidity_pct": 70.0,
        }
    ]
    forecast = [
        _forecast_row(now + timedelta(hours=6), 18.0),
    ]
    series = build_daily_climate_series(
        readings, forecast, "UTC", now=now
    )
    by_day = {d.day: d.source for d in series}
    assert by_day.get("2026-08-21") in ("unavailable", "observed")
    for day, source in by_day.items():
        if day > "2026-08-21":
            assert source in ("forecast", "unavailable")


def test_early_blight_observed_only() -> None:
    daily = DailyClimate(
        day="2026-08-20",
        t_max_c=28.0,
        t_min_c=26.0,
        rh_mean_pct=92.0,
        wet_hours=8,
        precip_sum_mm=0.0,
        source="observed",
        coverage_hours=20,
    )
    assert score_early_blight_day(daily) == 4.0
    forecast = DailyClimate(
        day="2026-08-21",
        t_max_c=28.0,
        t_min_c=26.0,
        rh_mean_pct=92.0,
        wet_hours=8,
        precip_sum_mm=0.0,
        source="forecast",
        coverage_hours=24,
    )
    assert score_early_blight_day(forecast) == 0.0


def test_forecast_chill_fires_for_tomato() -> None:
    base = datetime(2026, 7, 23, 2, 0, tzinfo=timezone.utc)
    rows = [
        _forecast_row(base + timedelta(hours=h), 2.0)
        for h in range(0, 8)
    ]
    ctx = EvalContext(
        readings=[],
        crop_type="tomato",
        lifecycle_stage="flowering",
        params={},
        max_gap_seconds=90.0,
        collector_interval_seconds=30.0,
        now=base,
        timezone="UTC",
        forecast_rows=rows,
    )
    decision = evaluate_forecast_chill_risk(ctx)
    assert decision.verdict == Verdict.FIRE
