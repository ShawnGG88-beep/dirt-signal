"""Wallin-style simplified late blight daily DSV score."""

from __future__ import annotations

from advisories.climate_merge import DailyClimate
from advisories.constants import (
    LATE_BLIGHT_MIN_MEAN_TEMP_C,
    LATE_BLIGHT_RH_THRESHOLD,
    LATE_BLIGHT_WET_HOURS_MIN,
)


def score_late_blight_day(daily: DailyClimate) -> float:
    """Daily severity for Phytophthora infestans.

    Primary trigger: RH >= 88% for >= 10 hours (2019 recalibration).
    Traditional alternative: 90% for 12h (Irish Rules) noted in comments only.
    """
    if daily.source != "observed":
        return 0.0
    if daily.t_max_c is None or daily.t_min_c is None:
        return 0.0
    t_mean = (daily.t_max_c + daily.t_min_c) / 2.0
    if t_mean < LATE_BLIGHT_MIN_MEAN_TEMP_C:
        return 0.0
    if daily.wet_hours < LATE_BLIGHT_WET_HOURS_MIN:
        return 0.0

    # Simplified Wallin tier from wet hours and mean temp during wet period.
    if daily.wet_hours >= 14 and t_mean >= 18.0:
        return 5.0
    if daily.wet_hours >= 12 and t_mean >= 15.0:
        return 3.0
    if daily.wet_hours >= LATE_BLIGHT_WET_HOURS_MIN:
        return 2.0
    return 0.0


def late_blight_wet_hours(daily: DailyClimate) -> int:
    return daily.wet_hours if daily.rh_mean_pct is not None else 0
