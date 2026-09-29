"""Tomato powdery mildew risk (Leveillula primary, Oidium secondary)."""

from __future__ import annotations

from dataclasses import dataclass

from advisories.climate_merge import DailyClimate
from advisories.constants import (
    LEVEILLULA_DELETERIOUS_C,
    LEVEILLULA_NIGHT_DAY_DELTA_C,
    LEVEILLULA_OPTIMAL_MAX_C,
    LEVEILLULA_OPTIMAL_MIN_C,
    OIDIUM_CANDIDATE_LABEL,
)


@dataclass(frozen=True)
class PowderyMildewAssessment:
    leveillula_elevated: bool
    leveillula_message: str
    oidium_candidate: bool
    oidium_message: str


def assess_powdery_mildew(daily_series: list[DailyClimate]) -> PowderyMildewAssessment:
    observed = [d for d in daily_series if d.source == "observed"]
    leveillula_days = 0
    for daily in observed[-7:]:
        if daily.t_max_c is None or daily.t_min_c is None:
            continue
        if daily.t_max_c > LEVEILLULA_DELETERIOUS_C:
            continue
        if LEVEILLULA_OPTIMAL_MIN_C <= daily.t_max_c <= LEVEILLULA_OPTIMAL_MAX_C:
            if daily.t_max_c - daily.t_min_c >= LEVEILLULA_NIGHT_DAY_DELTA_C:
                leveillula_days += 1

    leveillula = leveillula_days >= 2
    leveillula_msg = (
        "Elevated Leveillula taurica risk: cool nights and warm days in forecast/observed window."
        if leveillula
        else "Leveillula taurica risk not elevated."
    )

    oidium_window = observed[-14:]
    oidium_temps = [
        d for d in oidium_window if d.t_max_c is not None and 15.0 <= d.t_max_c <= 25.0
    ]
    oidium_rh = [
        d.rh_mean_pct
        for d in oidium_window
        if d.rh_mean_pct is not None and 60.0 <= d.rh_mean_pct <= 90.0
    ]
    oidium = len(oidium_temps) >= 7 and len(oidium_rh) >= 7
    oidium_msg = (
        f"Oidium neolycopersici ({OIDIUM_CANDIDATE_LABEL}): sustained 15-25°C with "
        "RH 60-90% over 2-4 weeks."
        if oidium
        else f"Oidium neolycopersici ({OIDIUM_CANDIDATE_LABEL}): not elevated."
    )

    return PowderyMildewAssessment(
        leveillula_elevated=leveillula,
        leveillula_message=leveillula_msg,
        oidium_candidate=oidium,
        oidium_message=oidium_msg,
    )
