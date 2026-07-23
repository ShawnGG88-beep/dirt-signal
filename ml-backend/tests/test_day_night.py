"""Cross-boundary day/night tests — must match desktop dayNight.test.ts."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from day_night import is_day_period, local_day_key, local_hour

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "shared"
    / "fixtures"
    / "day_night_boundary.json"
)


def _cases() -> list[dict]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_day_night_boundary_fixture() -> None:
    for case in _cases():
        at = datetime.fromisoformat(case["recorded_at"].replace("Z", "+00:00"))
        tz = case["timezone"]
        assert local_hour(at, tz) == case["expect_local_hour"], case["id"]
        assert is_day_period(at, tz) is case["expect_day"], case["id"]
        assert local_day_key(at, tz) == case["expect_day_key"], case["id"]


def test_jhb_0500_utc_is_day_band() -> None:
    """Acceptance: 05:00 UTC with Africa/Johannesburg → day (07:00 local)."""
    at = datetime.fromisoformat("2026-07-23T05:00:00+00:00")
    assert is_day_period(at, "Africa/Johannesburg") is True
    assert local_hour(at, "Africa/Johannesburg") == 7
