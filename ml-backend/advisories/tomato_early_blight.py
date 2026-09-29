"""TOM-CAST-style early blight daily DSV score."""

from __future__ import annotations

from advisories.climate_merge import DailyClimate


def score_early_blight_day(daily: DailyClimate) -> float:
    """Daily severity for Alternaria (primary band 25-30°C + moisture)."""
    if daily.source != "observed":
        return 0.0
    t_max = daily.t_max_c
    t_min = daily.t_min_c
    if t_max is None or t_min is None:
        return 0.0
    t_mean = (t_max + t_min) / 2.0
    moist = (
        daily.precip_sum_mm > 0
        or (daily.rh_mean_pct is not None and daily.rh_mean_pct >= 90.0)
        or daily.wet_hours >= 6
    )
    if 25.0 <= t_mean <= 30.0 and moist:
        return 4.0
    if 5.0 <= t_mean < 25.0 and moist:
        return 1.0
    if moist and t_mean > 30.0:
        return 0.5
    return 0.0
