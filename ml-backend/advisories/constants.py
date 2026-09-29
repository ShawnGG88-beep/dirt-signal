"""Advisory thresholds and provenance strings."""

from __future__ import annotations

# Part A: spray window
SPRAY_PRECIP_PROB_MAX = 20.0
SPRAY_WIND_DRIFT_MAX_KMH = 15.0
SPRAY_WIND_DRIFT_PROVENANCE = (
    "Provisional drift threshold (15 km/h); needs local calibration against "
    "actual spray equipment."
)
SPRAY_HORIZON_HOURS = 48

# Part B: tomato chill / frost
TOMATO_FROST_C = 0.0
TOMATO_CHILL_MAX_C = 5.0
TOMATO_SLOW_GROWTH_MAX_C = 10.0
TOMATO_BLOSSOM_DROP_C = 13.0
CHILL_CONSECUTIVE_HOURS = 3

# Part C/D: DSV
EARLY_BLIGHT_DSV_THRESHOLD = 15.0
LATE_BLIGHT_DSV_THRESHOLD = 15.0
LATE_BLIGHT_MIN_MEAN_TEMP_C = 12.0
LATE_BLIGHT_RH_THRESHOLD = 88.0
LATE_BLIGHT_WET_HOURS_MIN = 10
# Traditional Irish Rules alternative: 90% RH for 12h (comment only in scorers)

# Part E: powdery mildew
LEVEILLULA_OPTIMAL_MIN_C = 20.0
LEVEILLULA_OPTIMAL_MAX_C = 30.0
LEVEILLULA_DELETERIOUS_C = 30.0
LEVEILLULA_NIGHT_DAY_DELTA_C = 8.0
OIDIUM_CANDIDATE_LABEL = (
    "candidate/unvalidated, less likely in this climate"
)

# Part F: moisture stability
MOISTURE_ROLLING_DAYS = 7
MOISTURE_DEPLETION_FRACTION = 0.22  # ~22% AWC placeholder
MOISTURE_WEEKLY_MM_MIN = 25.0
MOISTURE_WEEKLY_MM_MAX = 38.0
MOISTURE_WEEKLY_NOTE = (
    "Reference 25-38 mm/week during fruit development for context only, not a hard rule."
)

SOIL_TEXTURE_DEPLETION_PCT: dict[str, float] = {
    "sand": 55.0,
    "sandy_loam": 58.0,
    "loam": 60.0,
    "clay": 62.0,
}
SOIL_TEXTURE_PROVENANCE = (
    "Placeholder depletion bands pending HW-390 calibration curve translation."
)

MIN_OBSERVED_COVERAGE_HOURS = 18
