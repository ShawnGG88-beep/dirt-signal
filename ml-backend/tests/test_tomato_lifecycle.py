"""Tomato six-stage lifecycle, GDD gating, and blossom-drop stage names."""

from __future__ import annotations

from constants import (
    CROP_PROFILES,
    TOMATO_GDD_STAGE_BANDS,
    TOMATO_LIFECYCLE_STAGES,
    get_crop_stage,
    should_accumulate_gdd,
)
from phenology import accumulate_observed_gdd, infer_tomato_stage
from advisories.tomato_chill import _tier_for_low


def test_tomato_stage_keys_are_the_six_new_stages_in_order() -> None:
    keys = list(CROP_PROFILES["tomato"]["stages"])
    assert keys == list(TOMATO_LIFECYCLE_STAGES)
    assert "mature" not in keys
    assert "fruiting" not in keys
    assert "mature" in CROP_PROFILES["grape_wine"]["stages"]


def test_retired_tomato_stage_aliases_resolve_scoring_bands() -> None:
    vegetative = get_crop_stage("tomato", "vegetative_growth")
    assert get_crop_stage("tomato", "mature") is vegetative
    fruit = get_crop_stage("tomato", "fruit_development")
    assert get_crop_stage("tomato", "fruiting") is fruit
    assert fruit["moisture_min_pct"] == 65.0


def test_infer_tomato_stage_gdd_gates() -> None:
    assert infer_tomato_stage(None) is None
    assert infer_tomato_stage(0) is not None
    assert infer_tomato_stage(0).stage == "seedling"
    assert infer_tomato_stage(584.9).stage == "seedling"
    assert infer_tomato_stage(TOMATO_GDD_STAGE_BANDS["vegetative_growth"]).stage == (
        "vegetative_growth"
    )
    assert infer_tomato_stage(TOMATO_GDD_STAGE_BANDS["flowering"]).stage == "flowering"
    assert infer_tomato_stage(TOMATO_GDD_STAGE_BANDS["fruit_development"]).stage == (
        "fruit_development"
    )
    assert infer_tomato_stage(TOMATO_GDD_STAGE_BANDS["ripening"]).stage == "ripening"


def test_gdd_accumulates_from_seedling_not_germination() -> None:
    daily = [{"day": "2026-08-01", "gdd_day": 12.0, "incomplete": False}]
    seedling = accumulate_observed_gdd(
        daily, "2026-08-01", crop_type="tomato", lifecycle_stage="seedling"
    )
    germination = accumulate_observed_gdd(
        daily, "2026-08-01", crop_type="tomato", lifecycle_stage="germination"
    )
    assert seedling.cumulative_gdd == 12.0
    assert germination.cumulative_gdd == 0.0
    assert should_accumulate_gdd("tomato", "germination") is False
    assert should_accumulate_gdd("tomato", "seedling") is True
    assert should_accumulate_gdd("tomato", "vegetative_growth") is True
    assert should_accumulate_gdd("grape_wine", "mature") is True


def test_germination_and_seedling_tolerate_zero_and_null_gdd() -> None:
    assert infer_tomato_stage(0).stage == "seedling"
    assert infer_tomato_stage(None) is None
    empty = accumulate_observed_gdd(
        [{"day": "2026-08-01", "gdd_day": None, "incomplete": True}],
        "2026-08-01",
        crop_type="tomato",
        lifecycle_stage="seedling",
    )
    assert empty.cumulative_gdd == 0.0


def test_blossom_drop_gates_on_flowering_not_fruit_development() -> None:
    assert _tier_for_low(12.0, "flowering") == "blossom_drop"
    assert _tier_for_low(12.0, "fruit_development") != "blossom_drop"
    assert _tier_for_low(12.0, "fruiting") != "blossom_drop"
    assert _tier_for_low(12.0, "vegetative_growth") != "blossom_drop"
