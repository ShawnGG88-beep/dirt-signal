"""Tests for grape root-zone temp zones and moisture depletion scoring."""

from __future__ import annotations

from alerts.scoring import (
    SoilMoistureAnchors,
    get_metric_bounds,
    moisture_depletion_pct,
    score_grape_soil_temp,
    score_moisture_depletion,
    score_reading_metric,
)
from constants import (
    GRAPE_ROOT_SURVIVAL_RISK_C,
    GRAPE_ROOT_ZONE_TEMP_ZONES,
    get_crop_stage,
    grape_root_zone_temp_zone,
)


def test_grape_root_zone_temp_zones_shape() -> None:
    assert len(GRAPE_ROOT_ZONE_TEMP_ZONES) == 6
    assert [z["id"] for z in GRAPE_ROOT_ZONE_TEMP_ZONES] == [
        "dormant",
        "impaired",
        "functional",
        "optimal",
        "above_optimal",
        "heat_stress",
    ]
    assert GRAPE_ROOT_ZONE_TEMP_ZONES[4]["max_c"] == 29.7
    assert GRAPE_ROOT_ZONE_TEMP_ZONES[5]["min_c"] == 29.7
    assert GRAPE_ROOT_SURVIVAL_RISK_C == 35.0


def test_grape_root_zone_temp_boundaries() -> None:
    assert grape_root_zone_temp_zone(7.9)["id"] == "dormant"
    assert grape_root_zone_temp_zone(8.0)["id"] == "impaired"
    assert grape_root_zone_temp_zone(13.0)["id"] == "functional"
    assert grape_root_zone_temp_zone(21.0)["id"] == "optimal"
    assert grape_root_zone_temp_zone(24.0)["id"] == "above_optimal"
    assert grape_root_zone_temp_zone(29.7)["id"] == "heat_stress"


def test_score_grape_soil_temp_bypasses_restraint() -> None:
    cold = score_grape_soil_temp(10.0)
    assert cold.status == "warn"
    assert cold.zone_id == "impaired"

    reading = {"soil_temp_c": 10.0, "recorded_at": "2026-01-01T12:00:00+00:00"}
    via_profile = score_reading_metric(
        reading, "soil_temp_c", "grape_wine", "mature"
    )
    assert via_profile.status == "warn"
    assert via_profile.zone_id == "impaired"


def test_grape_soil_temp_ideal_band_on_both_stages() -> None:
    for stage in ("establishment", "mature"):
        bounds = get_metric_bounds("soil_temp_c", "grape_wine", stage)
        assert bounds is not None
        assert bounds.min == 21.0
        assert bounds.max == 24.0


def test_moisture_depletion_needs_calibration() -> None:
    score = score_moisture_depletion(45.0, None)
    assert score.status == "unknown"
    assert score.reason == "needs_calibration"

    partial = score_moisture_depletion(
        45.0, SoilMoistureAnchors(60.0, None)
    )
    assert partial.reason == "needs_calibration"


def test_moisture_depletion_math_and_status() -> None:
    anchors = SoilMoistureAnchors(60.0, 30.0)
    assert moisture_depletion_pct(60.0, anchors) == 0.0
    assert moisture_depletion_pct(30.0, anchors) == 100.0
    assert moisture_depletion_pct(45.0, anchors) == 50.0

    assert score_moisture_depletion(50.0, anchors).status == "ok"
    assert score_moisture_depletion(32.0, anchors).status == "watch"
    assert score_moisture_depletion(30.0, anchors).status == "warn"
    assert score_moisture_depletion(65.0, anchors).status == "watch"


def test_grape_moisture_uses_depletion_not_band() -> None:
    assert get_metric_bounds("moisture_pct", "grape_wine", "mature") is None
    stage = get_crop_stage("grape_wine", "mature")
    assert stage.get("moisture_min_pct") is None

    reading = {"moisture_pct": 45.0, "recorded_at": "2026-01-01T12:00:00+00:00"}
    unanchored = score_reading_metric(
        reading, "moisture_pct", "grape_wine", "mature"
    )
    assert unanchored.status == "unknown"
    assert unanchored.reason == "needs_calibration"

    anchored = score_reading_metric(
        reading,
        "moisture_pct",
        "grape_wine",
        "mature",
        anchors=SoilMoistureAnchors(60.0, 30.0),
    )
    assert anchored.status == "ok"
    assert anchored.depletion_pct == 50.0
    assert anchored.bounds is not None
    assert anchored.bounds.min == 30.0
    assert anchored.bounds.max == 60.0


def test_tomato_moisture_band_unchanged_even_with_anchors() -> None:
    bounds = get_metric_bounds("moisture_pct", "tomato", "vegetative_growth")
    assert bounds is not None
    assert bounds.min == 60.0
    assert bounds.max == 80.0

    reading = {"moisture_pct": 70.0, "recorded_at": "2026-01-01T12:00:00+00:00"}
    score = score_reading_metric(
        reading,
        "moisture_pct",
        "tomato",
        "vegetative_growth",
        anchors=SoilMoistureAnchors(60.0, 30.0),
    )
    assert score.status == "ok"
    assert score.depletion_pct is None
    assert score.bounds is not None
    assert score.bounds.min == 60.0
    assert score.bounds.max == 80.0
