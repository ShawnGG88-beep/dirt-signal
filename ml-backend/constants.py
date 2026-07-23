"""
Dirt Signal: crop reference profiles for growing conditions.

Used by the Reports feature to flag readings against crop- and stage-specific
reference data. Every numeric value is labelled as a target, a bound, or an
observation, and carries its source, units, and measurement method.

Do not invent numbers. Do not average disagreeing sources into a single band.
Do not use the bare abbreviation for universities that share initials: always
spell out Oklahoma State University and Ohio State University in full.

Crop keys are production goal and lifecycle stage, never cultivar. Zhao et al.
2019 tested five major grape varieties and found no significant differences in
soil organic matter or available nutrients; do not create per-variety profiles.

Caveat on N, P, K estimates from budget RS485 sensors: these estimate nutrients
from EC and dielectric properties using an unpublished formula, not direct
ion-selective measurement. Treat n_est, p_est, and k_est as provisional inputs
to be calibrated against chemical test strip ground truth (see soil_tests
table), not as trusted absolute readings.
"""

from __future__ import annotations

from enum import Enum
from typing import Any


class ScoringSemantic(str, Enum):
    """How readings relative to a reference band should be interpreted.

    Declared per lifecycle stage, not per crop, so further semantics can be
    added without collapsing into a boolean.
    """

    # Inside the band is good; outside is bad in both directions.
    OPTIMAL_BAND = "optimal_band"
    # Values above the reference band indicate excess vigour risk, not
    # deficiency. Under restraint, UI and advice must never recommend
    # increasing nitrogen.
    RESTRAINT = "restraint"


DEFAULT_CROP_TYPE = "tomato"
DEFAULT_LIFECYCLE_STAGE = "mature"

# ---------------------------------------------------------------------------
# Shared sampling limitations (any grape device)
# ---------------------------------------------------------------------------

SAMPLING_LIMITATIONS: list[str] = [
    (
        "All three source studies used composite sampling. Zhao et al. took "
        "five positions per vineyard in an S pattern with five duplicates. "
        "Rosen recommends 15 to 20 cores per sample in a zig-zag pattern and "
        "calls sampling the weakest link in a soil testing programme. "
        "Gonzalez-Maldonado et al. found tractor rows and vine rows differ "
        "significantly. Dirt Signal reads a single fixed point. It measures "
        "that point, not the plot."
    ),
    (
        "Rosen recommends soil testing before planting and every 4 to 5 years "
        "thereafter, supplemented by petiole analysis once vines are "
        "established. Continuous sensor data is a different instrument "
        "answering a different question, and is not a substitute for either."
    ),
    (
        "None of the three sources is South African. Shanghai is subtropical "
        "humid monsoon, Napa is semi-arid Mediterranean, Minnesota and "
        "Michigan are cool continental. Local validation is required before "
        "any Cape Winelands claim."
    ),
    (
        "Air VPD assumes leaf temperature equals air temperature. That "
        "assumption is weakest under artificial lighting and still air — "
        "both of which describe the current indoor setup. Displayed VPD is "
        "air VPD, not leaf-to-air VPD."
    ),
    (
        "The sensor stack cannot measure leaf wetness, canopy humidity, or "
        "rainfall. Ambient relative humidity at probe height is a weak "
        "substitute for all three. High-humidity hours are a proxy for leaf "
        "wetness duration, never leaf wetness itself and never a disease "
        "risk score."
    ),
]


# ---------------------------------------------------------------------------
# Crop profiles keyed by crop_type -> stages -> lifecycle_stage
# ---------------------------------------------------------------------------

CROP_PROFILES: dict[str, dict[str, Any]] = {
    # ------------------------------------------------------------------
    # Tomato (unchanged values; citations spell out Oklahoma State University)
    # ------------------------------------------------------------------
    "tomato": {
        "display_name": "Tomato",
        # Single-triangle GDD base (°C). Shared with grape today; per-crop so
        # it can diverge later without a refactor.
        "gdd_base_c": 10.0,
        "stages": {
            "mature": {
                "scoring_semantic": ScoringSemantic.OPTIMAL_BAND.value,
                "sources": [
                    (
                        "General horticultural references (multiple, uncited, "
                        "common consensus ranges for tomato growing)"
                    ),
                    (
                        "Hillock, D.A. and Rebek, E. \"Growing Tomatoes in the "
                        "Home Garden.\" Oklahoma Cooperative Extension Service, "
                        "HLA-6012. Oklahoma State University."
                    ),
                ],
                # Soil pH
                # Oklahoma State University HLA-6012: "prefer deep, fertile,
                # well-drained soil ... slightly acidic (pH of about 6.5)"
                "ph_min": 6.0,
                "ph_max": 6.8,
                "ph_ideal": 6.5,
                "ph_status": "target",
                "ph_units": "pH units",
                "ph_method": "BNC pH probe (field)",
                # Soil moisture, calibrated percentage (relative to your
                # specific soil and sensor calibration curve, not an absolute
                # field capacity measurement)
                "moisture_min_pct": 60.0,
                "moisture_max_pct": 80.0,
                "moisture_status": "target",
                "moisture_units": "calibrated %",
                "moisture_method": "dielectric / capacitive soil moisture probe",
                # Soil temperature
                # Oklahoma State University HLA-6012: tomatoes should go in the
                # ground when soil temperature is above 60F (~15.5C);
                # temperatures below 50F (~10C) impair growth entirely
                "soil_temp_min_c": 10.0,  # hard floor, growth impaired below
                "soil_temp_planting_min_c": 15.5,  # minimum to transplant
                "soil_temp_ideal_min_c": 18.0,
                "soil_temp_ideal_max_c": 24.0,
                "soil_temp_max_c": 32.0,  # root stress above this
                "soil_temp_status": "target",
                "soil_temp_units": "deg C",
                "soil_temp_method": "soil temperature probe",
                # Ambient temperature
                # Oklahoma State University HLA-6012: fruit set fails when
                # night temp is below ~60F (15.5C) or above ~70F (21C), or
                # when day temp is consistently above ~92F (33C)
                "ambient_temp_day_min_c": 21.0,
                "ambient_temp_day_max_c": 27.0,
                "ambient_temp_night_min_c": 15.5,
                "ambient_temp_night_max_c": 21.0,
                "ambient_temp_fruit_set_ceiling_c": 33.0,
                "ambient_temp_status": "target",
                "ambient_temp_units": "deg C",
                "ambient_temp_method": "ambient air sensor",
                # Ambient humidity
                "humidity_min_pct": 65.0,
                "humidity_max_pct": 75.0,
                "humidity_status": "target",
                "humidity_units": "% RH",
                "humidity_method": "ambient humidity sensor",
                # Electrical conductivity (once an EC-capable sensor is added)
                "ec_min_ms_cm": 2.0,
                "ec_max_ms_cm": 3.5,
                "ec_status": "target",
                "ec_units": "mS/cm",
                "ec_method": "RS485 EC probe (direct)",
                # N, P, K categorical levels
                # Oklahoma State University HLA-6012: "tomatoes prefer a
                # fertilizer low in nitrogen, high in phosphorus, and medium
                # to high in potassium" (e.g. 10-20-10 ratio)
                # These are directional targets, not numeric bounds, given the
                # sensor estimation caveat above.
                "npk_levels": ["depleted", "low", "medium", "high", "surplus"],
                "n_target": "low",  # low to moderate; surplus delays fruit set
                "p_target": "high",
                "k_target": "high",  # especially during fruiting
                "npk_status": "target",
                "npk_units": "categorical level (not ppm)",
                "npk_method": (
                    "RS485 estimate from EC/dielectric; calibrate against "
                    "soil_tests chemical strips"
                ),
                # Known physiological risk: blossom end rot
                # Oklahoma State University HLA-6012: BER results from calcium
                # deficiency in young fruit "due to fluctuations in available
                # moisture," occurring when soil is either too dry or
                # excessively wet. A useful validation target: if moisture
                # readings swing repeatedly outside moisture_min_pct /
                # moisture_max_pct and BER is later observed on the plant,
                # that is a citable link between sensor data and a real
                # outcome for the case study.
                "blossom_end_rot_note": (
                    "BER linked to moisture fluctuation (Oklahoma State "
                    "University HLA-6012); validate against moisture swings "
                    "outside the target band."
                ),
            },
        },
    },
    # ------------------------------------------------------------------
    # Wine grape (production goal: wine; stages: establishment | mature)
    # ------------------------------------------------------------------
    "grape_wine": {
        "display_name": "Wine grape",
        "gdd_base_c": 10.0,
        # Zhao et al. 2019 tested five major grape varieties and found no
        # significant differences in soil OM or available nutrients. Profiles
        # split by production goal and lifecycle stage only, never cultivar.
        "stages": {
            "establishment": {
                "scoring_semantic": ScoringSemantic.OPTIMAL_BAND.value,
                "source": (
                    "Rosen, C. 2014. \"Soil Fertility for Wine Grapes\", "
                    "University of Minnesota Extension, Michigan Wine Grape "
                    "Vineyard Establishment Conference, 22 January 2014."
                ),
                "units": "ppm, standard US soil test extraction",
                "units_note": (
                    "Not comparable to ASI mg/L values in the grape_table "
                    "profile."
                ),
                "ph_target": {
                    "range": [6.0, 7.0],
                    "status": "target",
                    "units": "pH units",
                    "method": "BNC pH probe (field); lab soil test for lime rate",
                    "source": "Rosen 2014",
                    "note": (
                        "Stated ideal pH range for grapes. Four cited "
                        "sufficiency sources overlap around 6.0 to 6.5. This "
                        "is our first real agronomic grape target and it is "
                        "directly measurable by our BNC pH probe."
                    ),
                },
                "ph_action_bands": {
                    "source": "Rosen 2014, pre-plant only",
                    "status": "target",
                    "units": "pH units",
                    "method": "lab soil test (buffer pH for lime rate)",
                    "bands": {
                        "below_5.3": (
                            "Phosphorus deficiency risk on acid soils."
                        ),
                        "below_6.0": (
                            "Lime recommended. Rate depends on buffer pH, "
                            "which depends on clay and organic matter. Use "
                            "dolomitic lime if magnesium is also low. "
                            "Incorporate 8 to 10 inches, apply one year "
                            "before planting."
                        ),
                        "6.0_to_6.5": "Optimal. No action.",
                        "6.5_to_7.0": "Acceptable. No amendments needed.",
                        "7.0_to_7.5": (
                            "Apply elemental sulfur to lower pH to 6.5 or 6.0."
                        ),
                        "above_7.5": (
                            "Apply sulfur only if the soil is carbonate free. "
                            "If carbonates are present this is not cost "
                            "effective; use soil-applied iron chelates if "
                            "chlorosis appears."
                        ),
                    },
                    "note": (
                        "These are PRE-PLANT actions. Rosen states pH is "
                        "difficult to change after planting, and that once "
                        "planted only surface applications are possible, "
                        "which for some amendments are inefficient or "
                        "ineffective. For a device with "
                        "lifecycle_stage='mature', report pH but do not "
                        "surface these amendment actions as if they were "
                        "still available."
                    ),
                },
                "sufficiency_ranges_ppm": {
                    "status": "target",
                    "units": "ppm",
                    "method": "standard US soil test extraction",
                    "phosphorus": {
                        "ohio_state": [20, 50],
                        "iowa_state": ">30",
                        "minnesota": ">25",
                        "nraes_145": [20, 50],
                    },
                    "potassium": {
                        "ohio_state": [125, 150],
                        "iowa_state": ">150",
                        "minnesota": ">160",
                        "nraes_145": [75, 100],
                    },
                    "magnesium": {
                        "ohio_state": [100, 125],
                        "iowa_state": [100, 125],
                        "minnesota": "~100",
                        "nraes_145": [100, 250],
                    },
                    "zinc": {
                        "ohio_state": [4, 5],
                        "iowa_state": [3, 4],
                        "minnesota": ">1",
                        "nraes_145": "2",
                    },
                    "organic_matter_percent": {
                        "ohio_state": [2, 3],
                        "iowa_state": [2, 4],
                        "nraes_145": [3, 5],
                    },
                    "calcium": {
                        "minnesota": ">600",
                        "nraes_145": [500, 2000],
                    },
                    "boron": {
                        "ohio_state": [0.75, 1.0],
                        "minnesota": ">1",
                        "nraes_145": [0.2, 2.0],
                    },
                    "sulfur": {
                        "iowa_state": ">7",
                        "minnesota": ">7",
                    },
                    "note": (
                        "Sources disagree, notably potassium where NRAES-145 "
                        "gives 75-100 ppm and Minnesota gives >160 ppm. Do "
                        "NOT average them into a single band. Surface the "
                        "range of expert opinion, or pick one source per "
                        "deployment region and say which. Citations: Ohio "
                        "State University Ext. Bull. 861 (Midwest Small Fruit "
                        "Pest Management Handbook) and 919 (Midwest Grape "
                        "Production Guide); NRAES-145 (Wine Grape Production "
                        "Guide for Eastern North America)."
                    ),
                },
                "nitrogen": {
                    "direction": "adequate_then_restrain",
                    "soil_test_reliable": False,
                    "status": "target",
                    "units": "lb N/acre (source units; not converted)",
                    "method": (
                        "Not from soil N test; Rosen: adjust to soil organic "
                        "matter instead"
                    ),
                    "source": "Rosen 2014",
                    "note": (
                        "Rosen states soil tests for nitrogen are not "
                        "reliable and recommendations should be adjusted to "
                        "soil organic matter instead. Nitrogen is mobile, so "
                        "pre-plant N is generally not needed for grapes. "
                        "Non-bearing vine guidance: 30 lb N/acre on high OM "
                        "soils (>4.6%), 45 lb on medium (3.1-4.5%), 60 lb on "
                        "low (<3.1%). Deficiency shows as poor vine growth, "
                        "pale yellow leaves, low sugar and low yeast "
                        "assimilable nitrogen. Excess shows as excessive vine "
                        "growth and poor fruit colour. Metric conversion of "
                        "the lb/acre figures is left deliberately undone; do "
                        "not convert and present them as our own guidance."
                    ),
                },
                "potassium_note": (
                    "Two-sided, unlike nitrogen. Grapes are susceptible to K "
                    "deficiency especially when fruiting. Low K gives low "
                    "fruit sugars. High K raises fruit pH, which is "
                    "undesirable for wine. Harm exists on both sides of the "
                    "band."
                ),
            },
            "mature": {
                "scoring_semantic": ScoringSemantic.RESTRAINT.value,
                "source": (
                    "Gonzalez-Maldonado et al. 2026, European Journal of Soil "
                    "Science 77:e70265 (32 sites, 384 samples, Napa Valley, "
                    "sampled 2021, 0-20 cm)."
                ),
                "units": "mg/kg and g/kg, combustion and K2SO4 extraction",
                "ec_upper_alarm_dS_per_m": {
                    "value": 4.0,
                    "status": "bound",
                    "units": "dS/m",
                    "method": "RS485 EC probe (direct); Rhoades et al. 1999 "
                    "threshold as cited in Gonzalez-Maldonado et al. 2026",
                    "source": (
                        "Rhoades et al. 1999, cited in Gonzalez-Maldonado "
                        "et al. 2026"
                    ),
                    "note": (
                        "Salinity threshold for plants (Rhoades et al. 1999, "
                        "cited in Gonzalez-Maldonado et al. 2026). All 32 "
                        "Napa sites fell below it. This is a hard actionable "
                        "bound and our RS485 sensor measures EC directly."
                    ),
                },
                "ec_observed_dS_per_m": {
                    "mean": 1.15,
                    "min": 0.34,
                    "max": 5.32,
                    "status": "observation",
                    "units": "dS/m (paper unit labelling inconsistent; see note)",
                    "method": "as reported in Gonzalez-Maldonado et al. 2026",
                    "source": "Gonzalez-Maldonado et al. 2026",
                    "note": (
                        "The source paper is internally inconsistent on EC "
                        "units between Table 1, Table 2 and Figure 4. Do not "
                        "derive an ideal/challenging EC split from it. Use "
                        "the 4 dS/m alarm only."
                    ),
                },
                "ph_reference": {
                    "status": "observational",
                    "units": "pH units",
                    "method": "as reported in Gonzalez-Maldonado et al. 2026",
                    "source": "Gonzalez-Maldonado et al. 2026",
                    "observed_mean": 7.01,
                    "observed_range": [5.6, 8.3],
                    "grower_rated_ideal_mean": 6.84,
                    "grower_rated_challenging_mean": 7.17,
                    "note": (
                        "CROSS-SOURCE AGREEMENT worth preserving: "
                        "grower-rated ideal soils averaged 6.84, which sits "
                        "inside Rosen's 6.0 to 7.0 target, while challenging "
                        "soils averaged 7.17, which sits outside it. Two "
                        "independent sources, one extension guidance and one "
                        "grower-participatory study, point the same way. "
                        "Caveat: the authors note grower ratings were "
                        "qualitative and exploratory, that no quantitative "
                        "benchmarks exist for these categories, and that the "
                        "pH difference is likely confounded with clay content."
                    ),
                },
                "nitrogen": {
                    "direction": "restraint",
                    "soil_test_reliable": False,
                    "status": "observation",
                    "units": "g/kg total N; mg/kg plant-available N",
                    "method": (
                        "combustion / K2SO4 extraction "
                        "(Gonzalez-Maldonado et al. 2026)"
                    ),
                    "source": "Gonzalez-Maldonado et al. 2026",
                    "note": (
                        "Total N was significantly LOWER in grower-rated "
                        "ideal soils (1.18 vs 1.33 g/kg). Plant-available N "
                        "across all sites was low (about 5 mg/kg) and is "
                        "highly dynamic over hours to weeks. Vine roots "
                        "concentrate at 1 to 2 m, well below our sensor. "
                        "This independently corroborates Rosen 2014, which "
                        "says soil N tests are unreliable and excess N "
                        "causes excessive vine growth. Never advise "
                        "increasing N for a grape_wine mature device."
                    ),
                },
                "unmeasurable_but_dominant": {
                    "status": "observation",
                    "source": "Gonzalez-Maldonado et al. 2026",
                    "note": (
                        "Random Forest importance for predicting "
                        "grower-rated soil quality ranked clay "
                        "(24.5 %IncMSE), sand (19.7) and tillage management "
                        "above EC (17.7) and pH (9.2). Of the top predictors, "
                        "Dirt Signal measures only EC and pH. Texture, total "
                        "carbon, POXC and aggregate stability require lab "
                        "analysis. Surface this as an honest limitation in "
                        "the Reports view rather than implying sensor data "
                        "alone characterises vineyard soil health."
                    ),
                },
            },
        },
    },
    # ------------------------------------------------------------------
    # Table grape (production goal: table; mature stage from Zhao et al.)
    # ------------------------------------------------------------------
    "grape_table": {
        "display_name": "Table grape",
        "gdd_base_c": 10.0,
        # Zhao et al. 2019 tested five major grape varieties and found no
        # significant differences in soil OM or available nutrients. Profiles
        # split by production goal and lifecycle stage only, never cultivar.
        "stages": {
            "mature": {
                "scoring_semantic": ScoringSemantic.OPTIMAL_BAND.value,
                "source": (
                    "Zhao et al. 2019, Heliyon 5 e02362 (73 vineyards, "
                    "Shanghai suburbs, ASI method, 0-20 cm, winter 2014)."
                ),
                "units": "mg/L via ASI extraction",
                "units_note": (
                    "NOT comparable to ppm values in the grape_wine profile."
                ),
                "asi_grading_standard": {
                    "status": "observation",
                    "units": "mg/L (ASI) except OM as percent",
                    "method": "ASI extraction (Zhao et al. 2019 Table 1)",
                    "source": (
                        "Zhao et al. 2019 Table 1, variety-general "
                        "classification, NOT targets"
                    ),
                    "OM_percent": {
                        "low": "<0.5",
                        "medium": "0.5-1",
                        "high": "1-1.5",
                        "extra_high": ">1.5",
                    },
                    "N_mg_per_L": {
                        "low": "<20",
                        "medium": "20-50",
                        "high": "50-100",
                        "extra_high": ">100",
                    },
                    "P_mg_per_L": {
                        "low": "<12",
                        "medium": "12-24",
                        "high": "24-60",
                        "extra_high": ">60",
                    },
                    "K_mg_per_L": {
                        "low": "<80",
                        "medium": "80-120",
                        "high": "120-160",
                        "extra_high": ">160",
                    },
                },
                "observed_benchmark": {
                    "status": "observation",
                    "units": "mg/L ASI / pH units / OM percent",
                    "method": "ASI extraction; field survey means by planting area",
                    "source": "Zhao et al. 2019",
                    "OM_percent": "0.65 to 0.99 across planting areas",
                    "available_N_mg_per_L": "76 to 108 across planting areas",
                    "pH": "5.70 to 7.43 across planting areas",
                    "note": (
                        "Soils in this study were mostly high or extra-high, "
                        "i.e. over-fertilised, some three times above the "
                        "extra-high threshold. The authors recommend reducing "
                        "total fertiliser and eliminating P fertiliser. These "
                        "figures describe a problem, not a goal. Explicitly "
                        "NOT targets."
                    ),
                },
                "scale_incompatibility_warning": (
                    "Do NOT cross-compare this profile's ASI bands with the "
                    "grape_wine sufficiency ranges. Rosen's minimum acceptable "
                    "organic matter for wine grape (2%) would score as "
                    "'extra-high' under the ASI standard (>1.5%). Different "
                    "extraction methods, different units, different crops, "
                    "different production goals. Any code that mixes them is "
                    "wrong."
                ),
            },
        },
    },
}


def get_crop_stage(
    crop_type: str | None = None,
    lifecycle_stage: str | None = None,
) -> dict[str, Any]:
    """Resolve reference data for (crop_type, lifecycle_stage).

    Falls back to (tomato, mature) when either key is missing or unknown.
    """
    crop_key = crop_type or DEFAULT_CROP_TYPE
    stage_key = lifecycle_stage or DEFAULT_LIFECYCLE_STAGE
    crop = CROP_PROFILES.get(crop_key)
    if crop is None:
        return CROP_PROFILES[DEFAULT_CROP_TYPE]["stages"][DEFAULT_LIFECYCLE_STAGE]
    stage = crop["stages"].get(stage_key)
    if stage is None:
        return CROP_PROFILES[DEFAULT_CROP_TYPE]["stages"][DEFAULT_LIFECYCLE_STAGE]
    return stage


def get_gdd_base_c(crop_type: str | None = None) -> float:
    """Single-triangle GDD base temperature (°C) for a crop profile."""
    crop = CROP_PROFILES.get(crop_type or DEFAULT_CROP_TYPE)
    if crop is None:
        crop = CROP_PROFILES[DEFAULT_CROP_TYPE]
    raw = crop.get("gdd_base_c", 10.0)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 10.0


def get_scoring_semantic(
    crop_type: str | None = None,
    lifecycle_stage: str | None = None,
) -> str:
    """Return the stage's scoring_semantic, defaulting via get_crop_stage."""
    stage = get_crop_stage(crop_type, lifecycle_stage)
    return str(stage.get("scoring_semantic", ScoringSemantic.OPTIMAL_BAND.value))


def is_grape_crop(crop_type: str | None) -> bool:
    """True when SAMPLING_LIMITATIONS should be surfaced in Reports."""
    return (crop_type or "").startswith("grape_")


def never_advise_increase_nitrogen(
    crop_type: str | None = None,
    lifecycle_stage: str | None = None,
) -> bool:
    """Under restraint (and wine-grape mature N direction), never push more N."""
    if get_scoring_semantic(crop_type, lifecycle_stage) == ScoringSemantic.RESTRAINT.value:
        return True
    stage = get_crop_stage(crop_type, lifecycle_stage)
    nitrogen = stage.get("nitrogen")
    if isinstance(nitrogen, dict):
        return nitrogen.get("direction") == "restraint"
    return False


# ---------------------------------------------------------------------------
# Backward-compatible tomato / mature module aliases
# (values unchanged; lookups should prefer get_crop_stage going forward)
# ---------------------------------------------------------------------------

_TOMATO_MATURE = CROP_PROFILES["tomato"]["stages"]["mature"]

PH_MIN = _TOMATO_MATURE["ph_min"]
PH_MAX = _TOMATO_MATURE["ph_max"]
PH_IDEAL = _TOMATO_MATURE["ph_ideal"]

MOISTURE_MIN_PCT = _TOMATO_MATURE["moisture_min_pct"]
MOISTURE_MAX_PCT = _TOMATO_MATURE["moisture_max_pct"]

SOIL_TEMP_MIN_C = _TOMATO_MATURE["soil_temp_min_c"]
SOIL_TEMP_PLANTING_MIN_C = _TOMATO_MATURE["soil_temp_planting_min_c"]
SOIL_TEMP_IDEAL_MIN_C = _TOMATO_MATURE["soil_temp_ideal_min_c"]
SOIL_TEMP_IDEAL_MAX_C = _TOMATO_MATURE["soil_temp_ideal_max_c"]
SOIL_TEMP_MAX_C = _TOMATO_MATURE["soil_temp_max_c"]

AMBIENT_TEMP_DAY_MIN_C = _TOMATO_MATURE["ambient_temp_day_min_c"]
AMBIENT_TEMP_DAY_MAX_C = _TOMATO_MATURE["ambient_temp_day_max_c"]
AMBIENT_TEMP_NIGHT_MIN_C = _TOMATO_MATURE["ambient_temp_night_min_c"]
AMBIENT_TEMP_NIGHT_MAX_C = _TOMATO_MATURE["ambient_temp_night_max_c"]
AMBIENT_TEMP_FRUIT_SET_CEILING_C = _TOMATO_MATURE["ambient_temp_fruit_set_ceiling_c"]

HUMIDITY_MIN_PCT = _TOMATO_MATURE["humidity_min_pct"]
HUMIDITY_MAX_PCT = _TOMATO_MATURE["humidity_max_pct"]

EC_MIN_MS_CM = _TOMATO_MATURE["ec_min_ms_cm"]
EC_MAX_MS_CM = _TOMATO_MATURE["ec_max_ms_cm"]

NPK_LEVELS = _TOMATO_MATURE["npk_levels"]
N_TARGET = _TOMATO_MATURE["n_target"]
P_TARGET = _TOMATO_MATURE["p_target"]
K_TARGET = _TOMATO_MATURE["k_target"]


# ---------------------------------------------------------------------------
# Plant event types (annotation layer)
# SOURCE OF TRUTH for event_type keys. Mirror in desktop/src/lib/eventTypes.ts.
# ---------------------------------------------------------------------------

PLANT_EVENT_TYPES: list[dict[str, Any]] = [
    {
        "key": "irrigation",
        "label": "Irrigation",
        "icon": "droplet",
        "quantity_applicable": True,
        "default_quantity_unit": "ml",
    },
    {
        "key": "fertiliser",
        "label": "Fertiliser",
        "icon": "flask",
        "quantity_applicable": True,
        "default_quantity_unit": "ml",
    },
    {
        "key": "pruning",
        "label": "Pruning",
        "icon": "scissors",
        "quantity_applicable": False,
        "default_quantity_unit": None,
    },
    {
        "key": "transplant",
        "label": "Transplant",
        "icon": "pot",
        "quantity_applicable": False,
        "default_quantity_unit": None,
    },
    {
        "key": "pest_disease_observation",
        "label": "Pest / disease seen",
        "icon": "eye",
        "quantity_applicable": False,
        "default_quantity_unit": None,
    },
    {
        "key": "pest_disease_treatment",
        "label": "Pest / disease treatment",
        "icon": "spray",
        "quantity_applicable": False,
        "default_quantity_unit": None,
    },
    {
        "key": "harvest",
        "label": "Harvest",
        "icon": "basket",
        "quantity_applicable": True,
        "default_quantity_unit": "g",
    },
    {
        "key": "sensor_calibration",
        "label": "Sensor calibration",
        "icon": "calibrate",
        "quantity_applicable": False,
        "default_quantity_unit": None,
    },
    {
        "key": "sensor_maintenance",
        "label": "Sensor maintenance",
        "icon": "wrench",
        "quantity_applicable": False,
        "default_quantity_unit": None,
    },
    {
        "key": "stage_change",
        "label": "Stage change",
        "icon": "swap",
        "quantity_applicable": False,
        "default_quantity_unit": None,
    },
    {
        "key": "observation",
        "label": "Observation",
        "icon": "note",
        "quantity_applicable": False,
        "default_quantity_unit": None,
    },
]

PLANT_EVENT_TYPE_KEYS: frozenset[str] = frozenset(
    str(entry["key"]) for entry in PLANT_EVENT_TYPES
)

# Colours for chart markers (stable palette, not scoring colours).
PLANT_EVENT_COLOURS: dict[str, str] = {
    "irrigation": "#107EEC",
    "fertiliser": "#2DB500",
    "pruning": "#FF8A00",
    "transplant": "#c0c0c0",
    "pest_disease_observation": "#e0b000",
    "pest_disease_treatment": "#e05050",
    "harvest": "#9b59b6",
    "sensor_calibration": "#1abc9c",
    "sensor_maintenance": "#e67e22",
    "stage_change": "#888888",
    "observation": "#555555",
}


def is_valid_event_type(event_type: str) -> bool:
    return event_type in PLANT_EVENT_TYPE_KEYS
