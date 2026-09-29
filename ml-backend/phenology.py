"""Grape wine GDD phenology: observed accumulation, stage inference, forecast projection.

Pure functions, no I/O. TypeScript mirror in shared/src/lib/phenology.ts.
Observed GDD uses sensor daily max/min only; forecast extends projection forward.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Literal

from constants import (
    EL_TO_BBCH_PHASES,
    GRAPE_WINE_PHENOLOGY_STAGE_LABELS,
    GRAPE_WINE_SEASON_START_DAY,
    GRAPE_WINE_SEASON_START_MONTH,
    TOMATO_GDD_STAGE_BANDS,
    TOMATO_GDD_STAGE_BANDS_PROVENANCE,
    TOMATO_LIFECYCLE_STAGE_LABELS,
    get_gdd_base_c,
    get_grape_wine_gdd_provenance,
    get_grape_wine_gdd_stage_bands,
    should_accumulate_gdd,
)
from day_night import local_day_key
from derived import CumulativeGdd, cumulative_gdd, gdd_day

GddConfidence = Literal["high", "indicative"]
GrapeWinePhenologyStage = Literal[
    "pre_budburst", "budburst", "flowering", "veraison", "harvest"
]


@dataclass(frozen=True)
class ElToBbchLookupResult:
    phase: str
    el_min: int
    el_max: int
    bbch_min: int
    bbch_max: int
    bbch_label: str


@dataclass(frozen=True)
class GrapeWineStageResult:
    stage: GrapeWinePhenologyStage
    stage_label: str
    provenance: str


@dataclass(frozen=True)
class ForecastDailyTemp:
    day: str
    t_max_c: float | None
    t_min_c: float | None


@dataclass(frozen=True)
class GddProjectionDay:
    day: str
    day_offset: int
    gdd_day: float | None
    cumulative_gdd: float
    confidence: GddConfidence
    inferred_stage: GrapeWinePhenologyStage
    inferred_stage_label: str


@dataclass(frozen=True)
class StageTransitionProjection:
    threshold: str
    threshold_gdd: float
    projected_day: str
    projected_stage: GrapeWinePhenologyStage


@dataclass(frozen=True)
class GddForecastProjection:
    provenance: str
    starting_cumulative_gdd: float
    days: list[GddProjectionDay]
    stage_transitions: list[StageTransitionProjection]


def _parse_at(raw: str | datetime) -> datetime:
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def grape_wine_season_start_hint(
    as_of: datetime | None = None,
    tz_name: str = "Africa/Johannesburg",
) -> str:
    """Most recent 1 September in device timezone (hint only, not applied)."""
    at = as_of or datetime.now(timezone.utc)
    local = _parse_at(at).astimezone(
        __import__("zoneinfo").ZoneInfo(tz_name)
    )
    season_year = local.year
    if (local.month, local.day) < (
        GRAPE_WINE_SEASON_START_MONTH,
        GRAPE_WINE_SEASON_START_DAY,
    ):
        season_year -= 1
    return date(
        season_year,
        GRAPE_WINE_SEASON_START_MONTH,
        GRAPE_WINE_SEASON_START_DAY,
    ).isoformat()


def accumulate_observed_gdd(
    daily: list[dict[str, Any]],
    season_start_date: str | None,
    crop_type: str | None = None,
    lifecycle_stage: str | None = None,
) -> CumulativeGdd:
    """Observed-only GDD accumulation; never substitutes forecast data."""
    if not should_accumulate_gdd(crop_type, lifecycle_stage):
        if not season_start_date:
            return CumulativeGdd(None, None, 0, "no_season_start")
        return CumulativeGdd(0.0, 0, 0, None)
    rows = [
        (
            str(row["day"]),
            row.get("gdd_day"),
            bool(row.get("incomplete")),
        )
        for row in daily
    ]
    return cumulative_gdd(rows, season_start_date=season_start_date)


def infer_grape_wine_stage(
    cumulative_gdd_value: float | None,
    cultivar: str | None = None,
) -> GrapeWineStageResult | None:
    if cumulative_gdd_value is None:
        return None
    bands = get_grape_wine_gdd_stage_bands(cultivar)
    if cumulative_gdd_value < bands["budburst"]:
        stage: GrapeWinePhenologyStage = "pre_budburst"
    elif cumulative_gdd_value < bands["flowering"]:
        stage = "budburst"
    elif cumulative_gdd_value < bands["veraison"]:
        stage = "flowering"
    elif cumulative_gdd_value < bands["harvest"]:
        stage = "veraison"
    else:
        stage = "harvest"
    return GrapeWineStageResult(
        stage=stage,
        stage_label=GRAPE_WINE_PHENOLOGY_STAGE_LABELS[stage],
        provenance=get_grape_wine_gdd_provenance(cultivar),
    )


@dataclass(frozen=True)
class TomatoStageResult:
    stage: str
    stage_label: str
    provenance: str


def infer_tomato_stage(
    cumulative_gdd_value: float | None,
) -> TomatoStageResult | None:
    """Map accumulated GDD onto the four GDD-gated tomato stages.

    Germination is never inferred from GDD (no accumulation). Values below the
    vegetative_growth threshold, including 0, map to seedling. Does not write
    devices.lifecycle_stage; display and tests only.
    """
    if cumulative_gdd_value is None:
        return None
    bands = TOMATO_GDD_STAGE_BANDS
    if cumulative_gdd_value < bands["vegetative_growth"]:
        stage = "seedling"
    elif cumulative_gdd_value < bands["flowering"]:
        stage = "vegetative_growth"
    elif cumulative_gdd_value < bands["fruit_development"]:
        stage = "flowering"
    elif cumulative_gdd_value < bands["ripening"]:
        stage = "fruit_development"
    else:
        stage = "ripening"
    return TomatoStageResult(
        stage=stage,
        stage_label=TOMATO_LIFECYCLE_STAGE_LABELS[stage],
        provenance=TOMATO_GDD_STAGE_BANDS_PROVENANCE,
    )


def lookup_el_to_bbch(el_number: int) -> ElToBbchLookupResult | None:
    for row in EL_TO_BBCH_PHASES:
        if row["el_min"] <= el_number <= row["el_max"]:
            return ElToBbchLookupResult(
                phase=str(row["phase"]),
                el_min=int(row["el_min"]),
                el_max=int(row["el_max"]),
                bbch_min=int(row["bbch_min"]),
                bbch_max=int(row["bbch_max"]),
                bbch_label=f"~{row['bbch_min']}-{row['bbch_max']}",
            )
    return None


def forecast_daily_temps_from_hourly(
    hourly: list[dict[str, Any]],
    tz_name: str,
) -> list[ForecastDailyTemp]:
    by_day: dict[str, list[float]] = {}
    for row in hourly:
        temp = row.get("temperature_2m")
        raw_time = row.get("forecast_time")
        if temp is None or raw_time is None:
            continue
        at = _parse_at(str(raw_time))
        day = local_day_key(at, tz_name)
        by_day.setdefault(day, []).append(float(temp))
    return [
        ForecastDailyTemp(
            day=day,
            t_max_c=max(temps),
            t_min_c=min(temps),
        )
        for day, temps in sorted(by_day.items())
    ]


def _confidence_for_offset(day_offset: int) -> GddConfidence:
    if 1 <= day_offset <= 3:
        return "high"
    return "indicative"


def _stage_after_threshold(threshold: str) -> GrapeWinePhenologyStage:
    mapping: dict[str, GrapeWinePhenologyStage] = {
        "budburst": "budburst",
        "flowering": "flowering",
        "veraison": "veraison",
        "harvest": "harvest",
    }
    return mapping.get(threshold, "pre_budburst")


def project_gdd_from_forecast(
    *,
    accumulated_gdd: float,
    forecast_days: list[ForecastDailyTemp],
    as_of_day: str,
    crop_type: str | None = "grape_wine",
    cultivar: str | None = None,
    max_horizon_days: int = 7,
) -> GddForecastProjection:
    base_c = get_gdd_base_c(crop_type)
    future = [d for d in forecast_days if d.day > as_of_day][:max_horizon_days]
    running = accumulated_gdd
    transitions: list[StageTransitionProjection] = []
    seen: set[str] = set()
    days: list[GddProjectionDay] = []
    bands = get_grape_wine_gdd_stage_bands(cultivar)

    for index, row in enumerate(future):
        day_offset = index + 1
        daily = (
            gdd_day(row.t_max_c, row.t_min_c, base_c=base_c)
            if row.t_max_c is not None and row.t_min_c is not None
            else None
        )
        prev_total = running
        if daily is not None:
            running += daily
        inferred = infer_grape_wine_stage(running, cultivar)
        assert inferred is not None
        confidence = _confidence_for_offset(day_offset)

        for key, threshold in bands.items():
            if key in seen:
                continue
            if prev_total < threshold <= running:
                seen.add(key)
                transitions.append(
                    StageTransitionProjection(
                        threshold=key,
                        threshold_gdd=threshold,
                        projected_day=row.day,
                        projected_stage=_stage_after_threshold(key),
                    )
                )

        days.append(
            GddProjectionDay(
                day=row.day,
                day_offset=day_offset,
                gdd_day=daily,
                cumulative_gdd=running,
                confidence=confidence,
                inferred_stage=inferred.stage,
                inferred_stage_label=inferred.stage_label,
            )
        )

    return GddForecastProjection(
        provenance=get_grape_wine_gdd_provenance(cultivar),
        starting_cumulative_gdd=accumulated_gdd,
        days=days,
        stage_transitions=transitions,
    )


def format_grape_wine_stage_line(
    cumulative_gdd_value: float | None,
    cultivar: str | None = None,
) -> str | None:
    result = infer_grape_wine_stage(cumulative_gdd_value, cultivar)
    if result is None:
        return None
    return f"{result.stage_label} (provisional)"


def format_tomato_stage_line(cumulative_gdd_value: float | None) -> str | None:
    result = infer_tomato_stage(cumulative_gdd_value)
    if result is None:
        return None
    return f"{result.stage_label} (provisional)"
