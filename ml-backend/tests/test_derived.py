"""Derived metrics tests — must match desktop derived.test.ts fixtures."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from derived import (
    MIN_R_SQUARED,
    dew_point_c,
    gdd_day,
    project_drydown,
    vapour_pressure_deficit_kpa,
)

ROOT = Path(__file__).resolve().parents[2]
VPD_FIXTURE = ROOT / "shared" / "fixtures" / "derived_vpd.json"
DRYDOWN_FIXTURE = ROOT / "shared" / "fixtures" / "drydown_cases.json"


def test_min_r_squared_is_provisional_point_seven() -> None:
    assert MIN_R_SQUARED == 0.7


def test_vpd_and_dewpoint_fixtures() -> None:
    cases = json.loads(VPD_FIXTURE.read_text(encoding="utf-8"))
    for case in cases:
        t = case["ambient_temp_c"]
        rh = case["ambient_humidity_pct"]
        vpd = vapour_pressure_deficit_kpa(t, rh)
        dew = dew_point_c(t, rh)
        if case["expect_vpd_kpa"] is None:
            assert vpd is None, case["id"]
        else:
            assert vpd is not None, case["id"]
            assert abs(vpd - case["expect_vpd_kpa"]) < 1e-4, case["id"]
        if case["expect_dew_point_c"] is None:
            assert dew is None, case["id"]
        else:
            assert dew is not None, case["id"]
            assert abs(dew - case["expect_dew_point_c"]) < 1e-3, case["id"]


def test_gdd_day_triangle() -> None:
    assert gdd_day(30, 10, base_c=10) == 10.0
    assert gdd_day(8, 5, base_c=10) == 0.0
    assert gdd_day(None, 10) is None


def test_drydown_shared_fixtures() -> None:
    cases = json.loads(DRYDOWN_FIXTURE.read_text(encoding="utf-8"))
    for case in cases:
        now = datetime.fromisoformat(case["now"].replace("Z", "+00:00"))
        result = project_drydown(
            case["readings"],
            case["events"],
            moisture_lower_bound=case["moisture_lower_bound"],
            now=now,
        )
        assert result.suppressed_reason == case["expect_suppressed_reason"], case[
            "id"
        ]
        if case["expect_hours_to_bound"] is None:
            assert result.projection is None, case["id"]
        else:
            assert result.projection is not None, case["id"]
            assert (
                abs(
                    result.projection.hours_to_lower_bound
                    - case["expect_hours_to_bound"]
                )
                < 0.05
            ), case["id"]
