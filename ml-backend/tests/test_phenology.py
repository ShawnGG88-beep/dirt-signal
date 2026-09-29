"""Phenology tests — must match shared/src/lib/phenology.test.ts fixtures."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from phenology import (
    forecast_daily_temps_from_hourly,
    grape_wine_season_start_hint,
    infer_grape_wine_stage,
    lookup_el_to_bbch,
    project_gdd_from_forecast,
    ForecastDailyTemp,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "shared" / "fixtures" / "phenology_cases.json"


def test_phenology_fixtures() -> None:
    cases = json.loads(FIXTURE.read_text(encoding="utf-8"))

    for case in cases["season_start_hint"]:
        as_of = datetime.fromisoformat(case["as_of"].replace("Z", "+00:00"))
        assert (
            grape_wine_season_start_hint(as_of, case["timezone"]) == case["expect"]
        ), case["id"]

    for case in cases["infer_stage"]:
        result = infer_grape_wine_stage(case["cumulative_gdd"])
        assert result is not None, case["id"]
        assert result.stage == case["expect_stage"], case["id"]
        assert "Northern Hemisphere" in result.provenance, case["id"]

    for case in cases["el_to_bbch"]:
        result = lookup_el_to_bbch(case["el"])
        if case["expect_phase"] is None:
            assert result is None, case["id"]
        else:
            assert result is not None, case["id"]
            assert result.phase == case["expect_phase"], case["id"]

    fd = cases["forecast_daily"]
    daily = forecast_daily_temps_from_hourly(fd["hourly"], fd["timezone"])
    assert [
        {"day": d.day, "t_max_c": d.t_max_c, "t_min_c": d.t_min_c} for d in daily
    ] == fd["expect_days"]

    p = cases["projection"]
    projection = project_gdd_from_forecast(
        accumulated_gdd=p["accumulated_gdd"],
        forecast_days=[
            ForecastDailyTemp(
                day=str(row["day"]),
                t_max_c=float(row["t_max_c"]),
                t_min_c=float(row["t_min_c"]),
            )
            for row in p["forecast_days"]
        ],
        as_of_day=p["as_of_day"],
    )
    assert projection.days[0].confidence == p["expect_first_confidence"]
    transition = next(
        (
            t
            for t in projection.stage_transitions
            if t.threshold == p["expect_transition_threshold"]
        ),
        None,
    )
    assert transition is not None
    assert transition.projected_day == p["expect_transition_day"]
    assert "Northern Hemisphere" in projection.provenance


def test_null_cultivar_keeps_shared_chardonnay_gdd_bands() -> None:
    assert infer_grape_wine_stage(74).stage == "pre_budburst"
    assert infer_grape_wine_stage(75).stage == "budburst"
    assert infer_grape_wine_stage(75, None).stage == "budburst"
    assert infer_grape_wine_stage(75, "chardonnay").stage == "budburst"
    assert infer_grape_wine_stage(75, "pinot_noir").stage == "budburst"


def test_cabernet_sauvignon_gdd_stage_thresholds() -> None:
    assert infer_grape_wine_stage(83.9, "cabernet_sauvignon").stage == "pre_budburst"
    assert infer_grape_wine_stage(84.0, "cabernet_sauvignon").stage == "budburst"
    assert infer_grape_wine_stage(374.9, "cabernet_sauvignon").stage == "budburst"
    assert infer_grape_wine_stage(375.0, "cabernet_sauvignon").stage == "flowering"
    assert infer_grape_wine_stage(1199.9, "cabernet_sauvignon").stage == "flowering"
    assert infer_grape_wine_stage(1200.0, "cabernet_sauvignon").stage == "veraison"
    assert infer_grape_wine_stage(1449.9, "cabernet_sauvignon").stage == "veraison"
    assert infer_grape_wine_stage(1450.0, "cabernet_sauvignon").stage == "harvest"
    assert infer_grape_wine_stage(2500.0, "cabernet_sauvignon").stage == "harvest"
