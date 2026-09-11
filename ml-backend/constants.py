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
# Shared null-coalesce for grape devices and missing DB rows. Grape_wine and
# grape_table still use "mature" as a real stage. Tomato no longer does.
DEFAULT_LIFECYCLE_STAGE = "mature"

# Tomato scoring-band fallback when the stored stage is missing, unknown, or
# the retired tomato value "mature". Same numeric bands as the old tomato
# mature stage.
TOMATO_FALLBACK_LIFECYCLE_STAGE = "vegetative_growth"

TOMATO_LIFECYCLE_STAGES: tuple[str, ...] = (
    "germination",
    "seedling",
    "vegetative_growth",
    "flowering",
    "fruit_development",
    "ripening",
)

# Lookup-only aliases for leftover DB values. Not selectable in the picker.
TOMATO_RETIRED_STAGE_ALIASES: dict[str, str] = {
    "mature": "vegetative_growth",
    "fruiting": "fruit_development",
}

TOMATO_GDD_ACCUMULATION_START_STAGE = "seedling"

# °C·d thresholds, base 10°C, accumulated from the start of seedling (not
# germination, and not from vegetative_growth). Germination and seedling have
# no GDD threshold.
TOMATO_GDD_STAGE_BANDS: dict[str, float] = {
    "vegetative_growth": 585.0,
    "flowering": 897.0,
    "fruit_development": 1216.0,
    "ripening": 1568.0,
}

TOMATO_GDD_STAGE_BANDS_PROVENANCE: str = (
    "Northern Hemisphere reference data, provisional pending local calibration. "
    "Single-study reference (California, one transplant date/season)."
)

TOMATO_LIFECYCLE_STAGE_LABELS: dict[str, str] = {
    "germination": "Germination",
    "seedling": "Seedling",
    "vegetative_growth": "Vegetative growth",
    "flowering": "Flowering",
    "fruit_development": "Fruit development",
    "ripening": "Ripening",
}

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


def _tomato_stage(**overrides: Any) -> dict[str, Any]:
    """Shared tomato scoring bands, with per-stage notes and moisture overrides.

    Numeric bands match the former tomato "mature" stage unless a stage
    overrides them (fruit_development / ripening raise the moisture band).
    """
    stage: dict[str, Any] = {
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
        "ph_min": 6.0,
        "ph_max": 6.8,
        "ph_ideal": 6.5,
        "ph_status": "target",
        "ph_units": "pH units",
        "ph_method": "BNC pH probe (field)",
        "moisture_min_pct": 60.0,
        "moisture_max_pct": 80.0,
        "moisture_status": "target",
        "moisture_units": "calibrated %",
        "moisture_method": "dielectric / capacitive soil moisture probe",
        "soil_temp_min_c": 10.0,
        "soil_temp_planting_min_c": 15.5,
        "soil_temp_ideal_min_c": 18.0,
        "soil_temp_ideal_max_c": 24.0,
        "soil_temp_max_c": 32.0,
        "soil_temp_status": "target",
        "soil_temp_units": "deg C",
        "soil_temp_method": "soil temperature probe",
        "ambient_temp_day_min_c": 21.0,
        "ambient_temp_day_max_c": 27.0,
        "ambient_temp_night_min_c": 15.5,
        "ambient_temp_night_max_c": 21.0,
        "ambient_temp_fruit_set_ceiling_c": 33.0,
        "ambient_temp_status": "target",
        "ambient_temp_units": "deg C",
        "ambient_temp_method": "ambient air sensor",
        "humidity_min_pct": 65.0,
        "humidity_max_pct": 75.0,
        "humidity_status": "target",
        "humidity_units": "% RH",
        "humidity_method": "ambient humidity sensor",
        "ec_min_ms_cm": 2.0,
        "ec_max_ms_cm": 3.5,
        "ec_status": "target",
        "ec_units": "mS/cm",
        "ec_method": "RS485 EC probe (direct)",
        "npk_levels": ["depleted", "low", "medium", "high", "surplus"],
        "n_target": "low",
        "p_target": "high",
        "k_target": "high",
        "npk_status": "target",
        "npk_units": "categorical level (not ppm)",
        "npk_method": (
            "RS485 estimate from EC/dielectric; calibrate against "
            "soil_tests chemical strips"
        ),
        "blossom_end_rot_note": (
            "BER linked to moisture fluctuation (Oklahoma State "
            "University HLA-6012); validate against moisture swings "
            "outside the target band."
        ),
    }
    stage.update(overrides)
    return stage


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
            "germination": _tomato_stage(
                typical_duration_note=(
                    "Typical duration 5-10 days at 21-27°C soil temperature. "
                    "Informational only, not an enforced boundary."
                ),
                stage_note=(
                    "Germination: no GDD threshold and no GDD accumulation. "
                    "Seed-tray germination is usually complete before an outdoor "
                    "sensor is measuring the plant."
                ),
            ),
            "seedling": _tomato_stage(
                typical_duration_note=(
                    "Typical duration 2-3 weeks after germination until true "
                    "leaves establish. Informational only, not an enforced boundary."
                ),
                stage_note=(
                    "Seedling: no GDD threshold to check against, but GDD "
                    "accumulation starts here (base 10°C), once the plant is "
                    "potted nearer its growing environment."
                ),
            ),
            "vegetative_growth": _tomato_stage(
                gdd_threshold_c_days=585.0,
                stage_note=(
                    "Vegetative growth: GDD threshold 585 °C·d (base 10°C, "
                    "accumulated from the start of seedling). "
                    + TOMATO_GDD_STAGE_BANDS_PROVENANCE
                ),
            ),
            "flowering": _tomato_stage(
                gdd_threshold_c_days=897.0,
                stage_note=(
                    "Flowering: blossom-drop risk uses forecast night lows "
                    "≤13°C when this stage is selected. GDD threshold 897 °C·d "
                    "(base 10°C, accumulated from the start of seedling). "
                    + TOMATO_GDD_STAGE_BANDS_PROVENANCE
                ),
            ),
            "fruit_development": _tomato_stage(
                moisture_min_pct=65.0,
                moisture_max_pct=85.0,
                gdd_threshold_c_days=1216.0,
                blossom_end_rot_note=(
                    "Fruit development: moisture stability advisories reference "
                    "25-38 mm/week and cracking/BER influx after dry spells."
                ),
                stage_note=(
                    "Fruit development: GDD threshold 1216 °C·d (base 10°C, "
                    "accumulated from the start of seedling). "
                    + TOMATO_GDD_STAGE_BANDS_PROVENANCE
                ),
            ),
            "ripening": _tomato_stage(
                moisture_min_pct=65.0,
                moisture_max_pct=85.0,
                gdd_threshold_c_days=1568.0,
                stage_note=(
                    "Ripening: GDD threshold 1568 °C·d (base 10°C, accumulated "
                    "from the start of seedling). "
                    + TOMATO_GDD_STAGE_BANDS_PROVENANCE
                ),
            ),
        },
    },
    # ------------------------------------------------------------------
    # Wine grape (production goal: wine; stages: establishment | mature)
    # ------------------------------------------------------------------
    "grape_wine": {
        "display_name": "Wine grape",
        "gdd_base_c": 10.0,
        # Zhao et al. 2019 tested five major grape varieties and found no
        # significant differences in soil OM or available nutrients. Nutrient
        # profiles stay split by production goal and lifecycle stage only.
        # Cultivar-specific phenology, frost and water-stress reference data
        # live in GRAPE_WINE_CULTIVAR_PROFILES, not here.
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
                # Zhang et al. 2024, Horticulturae 10(3):245: optimal 21-24°C.
                # Same band for establishment and mature — no sourced reason
                # to differentiate.
                "soil_temp_ideal_min_c": 21.0,
                "soil_temp_ideal_max_c": 24.0,
                # Rosen 2014 ph_target range [6.0, 7.0] — flat keys for
                # get_metric_bounds parity with shared growingConstants.ts
                "ph_min": 6.0,
                "ph_max": 7.0,
            },
            "mature": {
                "scoring_semantic": ScoringSemantic.RESTRAINT.value,
                # Zhang et al. 2024, Horticulturae 10(3):245: optimal 21-24°C.
                # Same band for establishment and mature — no sourced reason
                # to differentiate.
                "soil_temp_ideal_min_c": 21.0,
                "soil_temp_ideal_max_c": 24.0,
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


def canonical_tomato_lifecycle_stage(lifecycle_stage: str | None) -> str | None:
    """Map retired tomato stage names; leave grape and unknown keys untouched."""
    if lifecycle_stage is None:
        return None
    return TOMATO_RETIRED_STAGE_ALIASES.get(lifecycle_stage, lifecycle_stage)


def get_crop_stage(
    crop_type: str | None = None,
    lifecycle_stage: str | None = None,
) -> dict[str, Any]:
    """Resolve reference data for (crop_type, lifecycle_stage).

    Tomato lookups map retired names (mature, fruiting) onto the new six-stage
    model. Missing or unknown keys fall back to tomato vegetative_growth
    (the scoring-band equivalent of the old tomato mature stage). Grape still
    uses its own "mature" stage when that key is present on the grape profile.
    """
    crop_key = crop_type or DEFAULT_CROP_TYPE
    stage_key = lifecycle_stage or DEFAULT_LIFECYCLE_STAGE
    if crop_key == "tomato":
        stage_key = canonical_tomato_lifecycle_stage(stage_key) or (
            TOMATO_FALLBACK_LIFECYCLE_STAGE
        )
    crop = CROP_PROFILES.get(crop_key)
    if crop is None:
        return CROP_PROFILES[DEFAULT_CROP_TYPE]["stages"][
            TOMATO_FALLBACK_LIFECYCLE_STAGE
        ]
    stage = crop["stages"].get(stage_key)
    if stage is None:
        if crop_key == "tomato":
            return crop["stages"][TOMATO_FALLBACK_LIFECYCLE_STAGE]
        return CROP_PROFILES[DEFAULT_CROP_TYPE]["stages"][
            TOMATO_FALLBACK_LIFECYCLE_STAGE
        ]
    return stage


def tomato_gdd_accumulation_active(lifecycle_stage: str | None) -> bool:
    """True when tomato GDD should accumulate (seedling and later)."""
    canonical = canonical_tomato_lifecycle_stage(lifecycle_stage)
    if canonical not in TOMATO_LIFECYCLE_STAGES:
        return False
    start = TOMATO_LIFECYCLE_STAGES.index(TOMATO_GDD_ACCUMULATION_START_STAGE)
    return TOMATO_LIFECYCLE_STAGES.index(canonical) >= start


def should_accumulate_gdd(
    crop_type: str | None = None,
    lifecycle_stage: str | None = None,
) -> bool:
    """Grape always accumulates once season_start_date is set.

    Tomato accumulates from seedling onward, including leftover DB aliases
    mature and fruiting. Germination does not accumulate.
    """
    crop_key = crop_type or DEFAULT_CROP_TYPE
    if crop_key != "tomato":
        return True
    return tomato_gdd_accumulation_active(lifecycle_stage)


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
# Grape wine GDD phenology and cultivar reference profiles
# Distinct from Oklahoma State University tomato constants above.
#
# devices.cultivar is a nullable sibling of crop_type. Null keeps the shared
# GDD bands below (Chardonnay working points) so existing devices are unchanged.
# Nutrient scoring stays on crop_type=grape_wine (Zhao et al. 2019).
# ---------------------------------------------------------------------------

GRAPE_WINE_GDD_STAGE_BANDS_PROVENANCE: str = (
    "Northern Hemisphere reference data, provisional pending local calibration"
)

GRAPE_WINE_CULTIVAR_GDD_PROVENANCE: str = (
    "provisional - Northern Hemisphere reference data (Chile, Washington, France), "
    "pending local calibration"
)

# Southern Hemisphere season start hint (not auto-applied; devices.season_start_date
# must be set explicitly). Never use 1 March or 1 April (Northern Hemisphere).
GRAPE_WINE_SEASON_START_MONTH: int = 9
GRAPE_WINE_SEASON_START_DAY: int = 1

# °C·d working thresholds (base 10°C single-triangle). Fallback when cultivar is
# null, and the explicit Chardonnay table. Budburst uses the lower bound of the
# ~75-100 literature bracket, matching the historic shared table.
#
# Do not put Winkler regional classification totals (Region I <2500, Region II-III
# 2500-3500 °F GDD, base 50°F) in these stage bands. Winkler is whole-season
# climate classification, not budbreak-to-harvest accumulation. The two numbers
# are easily confused and must not be conflated.
GRAPE_WINE_GDD_STAGE_BANDS: dict[str, float] = {
    "budburst": 75.0,
    "flowering": 345.0,
    "veraison": 1267.0,
    "harvest": 1275.0,  # full season budburst to harvest
}

# Cabernet Sauvignon working points (base 10°C). Budburst uses the lower bound
# of ~84-92 (same convention as Chardonnay 75 from ~75-100). Veraison 1200 is
# the midpoint of an illustrative 1100-1300 bracket (lower confidence). Harvest
# 1450 is the midpoint of 1352-1558 from two independent studies.
#
# Not the Winkler Region II-III total (2500-3500 °F GDD). See winkler_region.
GRAPE_WINE_CABERNET_GDD_STAGE_BANDS: dict[str, float] = {
    "budburst": 84.0,
    "flowering": 375.0,
    "veraison": 1200.0,
    "harvest": 1450.0,
}

# Winkler Index Region I ceiling (°F GDD, base 50°F). Not compared to °C accumulator.
WINKLER_REGION_I_CEILING_GDD_F: float = 2500.0
WINKLER_INDEX_PROVENANCE: str = (
    "Winkler Index Region I ceiling (°F GDD, base 50°F); not comparable to °C phenology bands"
)
# Cabernet Sauvignon climate-classification band. Same unit/base as Region I.
# Still not comparable to the °C·d phenology stage bands above.
WINKLER_REGION_II_III_MIN_GDD_F: float = 2500.0
WINKLER_REGION_II_III_MAX_GDD_F: float = 3500.0
WINKLER_INDEX_NOT_PHENOLOGY_NOTE: str = (
    "Winkler Index is whole-season climate classification in °F GDD (base 50°F). "
    "It is not comparable to the °C·d phenology stage bands (base 10°C) and must "
    "not be used as budburst, flowering, veraison or harvest thresholds."
)

GRAPE_WINE_CULTIVAR_CHARDONNAY = "chardonnay"
GRAPE_WINE_CULTIVAR_PINOT_NOIR = "pinot_noir"
GRAPE_WINE_CULTIVAR_CABERNET_SAUVIGNON = "cabernet_sauvignon"

GRAPE_WINE_CULTIVAR_IDS: tuple[str, ...] = (
    GRAPE_WINE_CULTIVAR_CHARDONNAY,
    GRAPE_WINE_CULTIVAR_PINOT_NOIR,
    GRAPE_WINE_CULTIVAR_CABERNET_SAUVIGNON,
)

# Water-stress tables are reference/manual-comparison only. The HW-390 measures
# soil moisture, not leaf or stem water potential, so these figures must never
# feed evaluate_irrigation_due / project_drydown.
GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION: bool = False
GRAPE_WINE_WATER_STRESS_HARDWARE_NOTE: str = (
    "If you take a pressure chamber reading, compare it against this reference. "
    "The HW-390 measures soil moisture, not water potential of any kind. "
    "Live irrigation continues to run on soil-moisture depletion/dry-down. "
    "This table is for future manual calibration/validation, not live automation."
)

GRAPE_WINE_CULTIVAR_PROFILES: dict[str, dict[str, Any]] = {
    GRAPE_WINE_CULTIVAR_CHARDONNAY: {
        "id": GRAPE_WINE_CULTIVAR_CHARDONNAY,
        "display_name": "Chardonnay",
        "gdd_stage_bands": dict(GRAPE_WINE_GDD_STAGE_BANDS),
        "gdd_stage_band_notes": {
            "budburst": "~75-100 °C·d; working threshold 75 (lower bound)",
            "flowering": "~345 °C·d",
            "veraison": "~1267 °C·d",
            "harvest": "~1275 °C·d",
        },
        "gdd_provenance": (
            "Chardonnay GDD stage bands. " + GRAPE_WINE_CULTIVAR_GDD_PROVENANCE
        ),
        "winkler_region": "I",
        "winkler_region_label": "Region I (<2500 total seasonal GDD)",
        "winkler_gdd_f_min": None,
        "winkler_gdd_f_max": WINKLER_REGION_I_CEILING_GDD_F,
        "winkler_note": WINKLER_INDEX_NOT_PHENOLOGY_NOTE,
        "frost": {
            "coverage": "single_point",
            "stage_label": "budswell/budbreak",
            "slight_damage_c": -2.8,
            "slight_damage_f": 27.0,
            "el_rows": None,
            "note": (
                "Provisional single-point reference: slight damage at budswell/"
                "budbreak at 27°F (-2.8°C). Not a full E-L-staged table; none "
                "was independently sourced for Chardonnay."
            ),
            "deacclimation_note": None,
        },
        "water_stress": {
            "metric_type": "leaf_water_potential_gs50",
            "psi_mpa": -1.22,
            "psi_mpa_plus_minus": 0.06,
            "units": "MPa",
            "stages": None,
            "open_gap": False,
            "rdi_note": None,
            "severity_warning": None,
            "drives_irrigation": GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION,
            "note": GRAPE_WINE_WATER_STRESS_HARDWARE_NOTE,
        },
    },
    GRAPE_WINE_CULTIVAR_PINOT_NOIR: {
        "id": GRAPE_WINE_CULTIVAR_PINOT_NOIR,
        "display_name": "Pinot Noir",
        "gdd_stage_bands": dict(GRAPE_WINE_GDD_STAGE_BANDS),
        "gdd_stage_band_notes": {
            "budburst": (
                "Pinot Noir GDD not independently sourced; using Chardonnay as "
                "provisional proxy, same early-ripening Winkler Region I group"
            ),
            "flowering": (
                "Pinot Noir GDD not independently sourced; using Chardonnay "
                "as provisional proxy (~345 °C·d)"
            ),
            "veraison": (
                "Pinot Noir GDD not independently sourced; using Chardonnay "
                "as provisional proxy (~1267 °C·d)"
            ),
            "harvest": (
                "Pinot Noir GDD not independently sourced; using Chardonnay "
                "as provisional proxy (~1275 °C·d)"
            ),
        },
        "gdd_provenance": (
            "Pinot Noir GDD not independently sourced; using Chardonnay as "
            "provisional proxy, same early-ripening Winkler Region I group. "
            + GRAPE_WINE_CULTIVAR_GDD_PROVENANCE
        ),
        "winkler_region": "I",
        "winkler_region_label": "Region I (<2500 total seasonal GDD)",
        "winkler_gdd_f_min": None,
        "winkler_gdd_f_max": WINKLER_REGION_I_CEILING_GDD_F,
        "winkler_note": WINKLER_INDEX_NOT_PHENOLOGY_NOTE,
        "frost": {
            "coverage": "el_staged_table",
            "stage_label": "E-L staged",
            "slight_damage_c": None,
            "slight_damage_f": None,
            "el_rows": [
                {
                    "el_min": 2,
                    "el_max": 3,
                    "threshold_c": -3.3,
                    "label": "early (E-L 2-3)",
                },
                {
                    "el_min": 4,
                    "el_max": 4,
                    "threshold_c": -2.2,
                    "label": "budburst (E-L 4)",
                },
                {
                    "el_min": 9,
                    "el_max": 9,
                    "threshold_c": -1.7,
                    "label": "E-L 9",
                },
                {
                    "el_min": 11,
                    "el_max": 11,
                    "threshold_c": -1.1,
                    "label": "E-L 11",
                },
            ],
            "note": (
                "E-L-staged frost thresholds: tissue hardens as the season "
                "progresses even as the exposure window lengthens. "
                "Approximately -3.3°C at E-L 2-3, -2.2°C at E-L 4 (budburst), "
                "-1.7°C at E-L 9, -1.1°C at E-L 11."
            ),
            "deacclimation_note": None,
        },
        "water_stress": {
            "metric_type": None,
            "psi_mpa": None,
            "psi_mpa_plus_minus": None,
            "units": None,
            "stages": None,
            "open_gap": True,
            "rdi_note": None,
            "severity_warning": None,
            "drives_irrigation": GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION,
            "note": (
                "Pinot Noir water-stress reference not sourced; omitted rather "
                "than guessed. Open gap."
            ),
        },
    },
    GRAPE_WINE_CULTIVAR_CABERNET_SAUVIGNON: {
        "id": GRAPE_WINE_CULTIVAR_CABERNET_SAUVIGNON,
        "display_name": "Cabernet Sauvignon",
        "gdd_stage_bands": dict(GRAPE_WINE_CABERNET_GDD_STAGE_BANDS),
        "gdd_stage_band_notes": {
            "budburst": (
                "~84-92 °C·d (later-budding than Chardonnay ~75-100); "
                "working threshold 84 (lower bound)"
            ),
            "flowering": "~375 °C·d",
            "veraison": (
                "~1100-1300 °C·d illustrative bracket, lower confidence; "
                "working midpoint 1200"
            ),
            "harvest": (
                "~1352-1558 °C·d from two independent studies; "
                "working midpoint 1450"
            ),
        },
        "gdd_provenance": (
            "Cabernet Sauvignon GDD stage bands. "
            + GRAPE_WINE_CULTIVAR_GDD_PROVENANCE
        ),
        "winkler_region": "II-III",
        "winkler_region_label": "Region II-III (2500-3500 total seasonal GDD)",
        "winkler_gdd_f_min": WINKLER_REGION_II_III_MIN_GDD_F,
        "winkler_gdd_f_max": WINKLER_REGION_II_III_MAX_GDD_F,
        "winkler_note": WINKLER_INDEX_NOT_PHENOLOGY_NOTE,
        "frost": {
            "coverage": "single_point",
            "stage_label": "budswell",
            "slight_damage_c": -3.9,
            "slight_damage_f": 25.0,
            "el_rows": None,
            "note": (
                "Provisional single-point reference: no damage down to 25°F "
                "(-3.9°C) at budswell. Notably more frost-tolerant at this "
                "early stage than Chardonnay (slight damage at 27°F / -2.8°C). "
                "Not a full E-L-staged table."
            ),
            "deacclimation_note": (
                "Warm-climate variety with lower peak midwinter cold hardiness "
                "but slower deacclimation: less prone to false-spring-triggered "
                "early budbreak, but less hardiness in reserve if a hard freeze "
                "lands during an already-active period. Future frost-risk logic "
                "should weight forecast warm spells versus sudden late freezes "
                "differently for this cultivar."
            ),
        },
        "water_stress": {
            "metric_type": "stem_water_potential",
            "psi_mpa": None,
            "psi_mpa_plus_minus": None,
            "units": "MPa",
            "stages": [
                {
                    "phenological_stage": "2 weeks pre-bloom",
                    "psi_stem_mpa": -0.6,
                },
                {
                    "phenological_stage": "Bunch closure",
                    "psi_stem_mpa": -0.8,
                },
                {
                    "phenological_stage": "Veraison initiation",
                    "psi_stem_mpa": -1.0,
                },
                {
                    "phenological_stage": "End of veraison",
                    "psi_stem_mpa": -1.2,
                },
            ],
            "open_gap": False,
            "rdi_note": (
                "RDI regime found effective in trials: 50% ETc fruit-set to "
                "veraison, 80% ETc veraison to harvest. Descriptive note, "
                "not an automation input."
            ),
            "severity_warning": (
                "25% ETc strongly limited gas exchange and was economically "
                "unsustainable in one trial. Descriptive note, not an "
                "automation input."
            ),
            "drives_irrigation": GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION,
            "note": GRAPE_WINE_WATER_STRESS_HARDWARE_NOTE,
        },
    },
}


def normalise_grape_wine_cultivar(cultivar: str | None) -> str | None:
    """Return a canonical grape_wine cultivar id, or None if unset/unknown."""
    if cultivar is None:
        return None
    key = str(cultivar).strip().lower()
    if key == "":
        return None
    if key in GRAPE_WINE_CULTIVAR_PROFILES:
        return key
    return None


def is_valid_grape_wine_cultivar(cultivar: str | None) -> bool:
    """True for null/empty (valid unset) or a known grape_wine cultivar id."""
    if cultivar is None or str(cultivar).strip() == "":
        return True
    return normalise_grape_wine_cultivar(cultivar) is not None


def get_grape_wine_cultivar_profile(
    cultivar: str | None,
) -> dict[str, Any] | None:
    """Explicit cultivar profile, or None when cultivar is unset.

    Null does not silently become Chardonnay in the UI. GDD inference still
    falls back to GRAPE_WINE_GDD_STAGE_BANDS via get_grape_wine_gdd_stage_bands.
    """
    key = normalise_grape_wine_cultivar(cultivar)
    if key is None:
        return None
    return GRAPE_WINE_CULTIVAR_PROFILES[key]


def get_grape_wine_gdd_stage_bands(
    cultivar: str | None = None,
) -> dict[str, float]:
    """Working °C·d thresholds. Null or unknown cultivar uses the shared table."""
    profile = get_grape_wine_cultivar_profile(cultivar)
    if profile is None:
        return dict(GRAPE_WINE_GDD_STAGE_BANDS)
    return dict(profile["gdd_stage_bands"])


def get_grape_wine_gdd_provenance(cultivar: str | None = None) -> str:
    profile = get_grape_wine_cultivar_profile(cultivar)
    if profile is None:
        return GRAPE_WINE_GDD_STAGE_BANDS_PROVENANCE
    return str(profile["gdd_provenance"])


def grape_wine_cultivar_options() -> list[dict[str, str]]:
    return [
        {
            "cultivar": cultivar_id,
            "display_name": str(
                GRAPE_WINE_CULTIVAR_PROFILES[cultivar_id]["display_name"]
            ),
        }
        for cultivar_id in GRAPE_WINE_CULTIVAR_IDS
    ]


# E-L to BBCH mapping for later disease gating.
EL_TO_BBCH_PHASES: list[dict[str, Any]] = [
    {
        "phase": "shoot_development",
        "el_min": 5,
        "el_max": 18,
        "bbch_min": 9,
        "bbch_max": 17,
    },
    {
        "phase": "flowering",
        "el_min": 19,
        "el_max": 26,
        "bbch_min": 53,
        "bbch_max": 65,
    },
    {
        "phase": "berry_development",
        "el_min": 27,
        "el_max": 33,
        "bbch_min": 71,
        "bbch_max": 79,
    },
    {
        "phase": "ripening",
        "el_min": 34,
        "el_max": 38,
        "bbch_min": 81,
        "bbch_max": 89,
    },
]

GRAPE_WINE_PHENOLOGY_STAGE_LABELS: dict[str, str] = {
    "pre_budburst": "Pre-budburst",
    "budburst": "Budburst",
    "flowering": "Flowering",
    "veraison": "Veraison",
    "harvest": "Harvest",
}


# ---------------------------------------------------------------------------
# Grape wine root-zone soil temperature zones (graded scale, not a single
# min/max band). Applied to both establishment and mature stages — no sourced
# reason to differentiate was found. Mirror: shared/src/lib/growingConstants.ts
# ---------------------------------------------------------------------------

# Huang et al. 2005, cited in Holzapfel et al., Soil Temperature Prior to
# Veraison Alters Grapevine Carbon Partitioning, Am. J. Enol. Vitic. 71(1):52:
# root survival risk above 35°C. Marker within the heat_stress zone; not a
# separate scoring boundary.
GRAPE_ROOT_SURVIVAL_RISK_C = 35.0

GRAPE_ROOT_ZONE_TEMP_PROVENANCE = (
    "Graded root-zone temperature scale for grape_wine, applied identically to "
    "establishment and mature (no sourced reason to differentiate). "
    "Thresholds: Zhang et al. 2024 Horticulturae 10(3):245; Washington State "
    "University Extension Vineyard Nutrient Management; Zelleke and Kliewer "
    "1980; Thompson Seedless root-growth field study (~29.7°C); Huang et al. "
    "2005 via Holzapfel et al. Am. J. Enol. Vitic. 71(1):52."
)

# Deliberate deviation from a round 24-30 / >30 split: the sourced upper
# photosynthesis threshold is ~29.7°C, so the heat-stress boundary is 29.7
# rather than an unsourced 30.
GRAPE_ROOT_ZONE_TEMP_ZONES: list[dict[str, Any]] = [
    {
        "id": "dormant",
        "label": "Dormant / no root activity",
        "min_c": None,
        # Zhang et al. 2024, Horticulturae 10(3):245: root activity floor 8-10°C at 5cm
        "max_c": 8.0,
        "severity": "warn",
        "note": (
            "Below root activity floor; nutrient and water uptake has not begun."
        ),
    },
    {
        "id": "impaired",
        "label": "Root activity beginning, nutrient uptake impaired",
        # Zhang et al. 2024, Horticulturae 10(3):245: root activity begins 8-10°C at 5cm
        "min_c": 8.0,
        # Washington State University Extension, Vineyard Nutrient Management in
        # Washington State: practical nutrient-uptake floor ~13°C (55°F).
        # Zelleke and Kliewer 1980 (cited in Root Zone Temperature overview,
        # ScienceDirect Topics): at 12°C, xylem sap cytokinin is ~50% of the
        # level at 25°C.
        "max_c": 13.0,
        "severity": "warn",
        "note": (
            "Roots active but nutrient uptake still impaired relative to "
            "warmer soil."
        ),
    },
    {
        "id": "functional",
        "label": "Functional, below optimal",
        # Washington State University Extension practical uptake floor ~13°C
        "min_c": 13.0,
        # Zhang et al. 2024, Horticulturae 10(3):245: optimal band starts 21°C
        "max_c": 21.0,
        "severity": "watch",
        "note": (
            "Functional root-zone temperature; below the flowering/fruiting "
            "optimum."
        ),
    },
    {
        "id": "optimal",
        "label": "Optimal",
        # Zhang et al. 2024, Horticulturae 10(3):245: optimal 21-24°C (flowering/fruiting)
        "min_c": 21.0,
        "max_c": 24.0,
        "severity": "ok",
        "note": "Optimal root-zone band for flowering and fruiting.",
    },
    {
        "id": "above_optimal",
        "label": "Above optimal, approaching photosynthesis ceiling",
        # Zhang et al. 2024 optimal upper bound 24°C
        "min_c": 24.0,
        # Field study reported in Relationship between Root Growth of 'Thompson
        # Seedless' Grapevines and Soil Temperature: ~29.7°C root zone sits near
        # the upper threshold of optimum grapevine photosynthesis. Used as 29.7
        # rather than rounding to an unsourced 30.
        "max_c": 29.7,
        "severity": "watch",
        "note": (
            "Above optimal; approaching the upper photosynthesis threshold."
        ),
    },
    {
        "id": "heat_stress",
        "label": "Heat stress / root survival risk",
        # ~29.7°C upper photosynthesis threshold (Thompson Seedless field study)
        "min_c": 29.7,
        "max_c": None,
        "severity": "warn",
        "note": (
            "Heat stress. Root survival risk rises above 35°C "
            "(Huang et al. 2005)."
        ),
    },
]


def grape_root_zone_temp_zone(temp_c: float) -> dict[str, Any]:
    """Look up the graded zone containing a root-zone temperature (°C)."""
    for zone in GRAPE_ROOT_ZONE_TEMP_ZONES:
        min_c = zone["min_c"]
        max_c = zone["max_c"]
        above_min = min_c is None or temp_c >= min_c
        below_max = max_c is None or temp_c < max_c
        if above_min and below_max:
            return zone
    return GRAPE_ROOT_ZONE_TEMP_ZONES[-1]


# ---------------------------------------------------------------------------
# Backward-compatible tomato / mature module aliases
# (values unchanged; lookups should prefer get_crop_stage going forward)
# ---------------------------------------------------------------------------

_TOMATO_MATURE = CROP_PROFILES["tomato"]["stages"]["vegetative_growth"]

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
