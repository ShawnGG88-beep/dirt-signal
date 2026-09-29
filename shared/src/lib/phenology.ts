/**
 * Grape wine GDD phenology: observed accumulation, stage inference, forecast projection.
 *
 * Pure functions, no I/O. Python mirror in ml-backend/phenology.py.
 * Observed GDD uses sensor daily max/min only; forecast extends projection forward.
 */

import { localDayKey } from "./dayNight";
import { cumulativeGdd, gddDay, type CumulativeGdd } from "./derived";
import {
  EL_TO_BBCH_PHASES,
  GRAPE_WINE_PHENOLOGY_STAGE_LABELS,
  GRAPE_WINE_SEASON_START_DAY,
  GRAPE_WINE_SEASON_START_MONTH,
  TOMATO_GDD_STAGE_BANDS,
  TOMATO_GDD_STAGE_BANDS_PROVENANCE,
  TOMATO_LIFECYCLE_STAGE_LABELS,
  getGddBaseC,
  getGrapeWineGddProvenance,
  getGrapeWineGddStageBands,
  shouldAccumulateGdd,
  type ElToBbchPhase,
  type GrapeWineGddStageKey,
  type GrapeWinePhenologyStage,
  type TomatoLifecycleStage,
} from "./growingConstants";

export type GddConfidence = "high" | "indicative";

export interface ElToBbchLookupResult {
  phase: string;
  el_min: number;
  el_max: number;
  bbch_min: number;
  bbch_max: number;
  bbch_label: string;
}

export interface GrapeWineStageResult {
  stage: GrapeWinePhenologyStage;
  stage_label: string;
  provenance: string;
}

export interface ObservedDailyGdd {
  day: string;
  gdd_day: number | null;
  incomplete: boolean;
}

export interface ForecastHourlyTemp {
  forecast_time: string;
  temperature_2m: number | null;
}

export interface ForecastDailyTemp {
  day: string;
  t_max_c: number | null;
  t_min_c: number | null;
}

export interface GddProjectionDay {
  day: string;
  day_offset: number;
  gdd_day: number | null;
  cumulative_gdd: number;
  confidence: GddConfidence;
  inferred_stage: GrapeWinePhenologyStage;
  inferred_stage_label: string;
}

export interface StageTransitionProjection {
  threshold: GrapeWineGddStageKey;
  threshold_gdd: number;
  projected_day: string;
  projected_stage: GrapeWinePhenologyStage;
}

export interface GddForecastProjection {
  provenance: string;
  starting_cumulative_gdd: number;
  days: GddProjectionDay[];
  stage_transitions: StageTransitionProjection[];
}

/** Most recent 1 September in device timezone (hint only, not applied). */
export function grapeWineSeasonStartHint(
  asOf: Date = new Date(),
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(asOf);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");

  let seasonYear = year;
  if (
    month < GRAPE_WINE_SEASON_START_MONTH ||
    (month === GRAPE_WINE_SEASON_START_MONTH &&
      day < GRAPE_WINE_SEASON_START_DAY)
  ) {
    seasonYear -= 1;
  }

  const mm = String(GRAPE_WINE_SEASON_START_MONTH).padStart(2, "0");
  const dd = String(GRAPE_WINE_SEASON_START_DAY).padStart(2, "0");
  return `${seasonYear}-${mm}-${dd}`;
}

/** Observed-only GDD accumulation; never substitutes forecast data. */
export function accumulateObservedGdd(
  daily: ObservedDailyGdd[],
  seasonStartDate: string | null | undefined,
  cropType?: string | null,
  lifecycleStage?: string | null,
): CumulativeGdd {
  if (!shouldAccumulateGdd(cropType, lifecycleStage)) {
    if (!seasonStartDate) {
      return {
        cumulative_gdd: null,
        days_elapsed: null,
        days_excluded: 0,
        unavailable_reason: "no_season_start",
      };
    }
    return {
      cumulative_gdd: 0,
      days_elapsed: 0,
      days_excluded: 0,
      unavailable_reason: null,
    };
  }
  return cumulativeGdd(daily, seasonStartDate);
}

export interface TomatoStageResult {
  stage: TomatoLifecycleStage;
  stage_label: string;
  provenance: string;
}

export function inferTomatoStage(
  cumulativeGdd: number | null | undefined,
): TomatoStageResult | null {
  if (cumulativeGdd == null || Number.isNaN(cumulativeGdd)) {
    return null;
  }
  const bands = TOMATO_GDD_STAGE_BANDS;
  let stage: TomatoLifecycleStage;
  if (cumulativeGdd < bands.vegetative_growth) {
    stage = "seedling";
  } else if (cumulativeGdd < bands.flowering) {
    stage = "vegetative_growth";
  } else if (cumulativeGdd < bands.fruit_development) {
    stage = "flowering";
  } else if (cumulativeGdd < bands.ripening) {
    stage = "fruit_development";
  } else {
    stage = "ripening";
  }
  return {
    stage,
    stage_label: TOMATO_LIFECYCLE_STAGE_LABELS[stage],
    provenance: TOMATO_GDD_STAGE_BANDS_PROVENANCE,
  };
}

export function inferGrapeWineStage(
  cumulativeGdd: number | null | undefined,
  cultivar?: string | null,
): GrapeWineStageResult | null {
  if (cumulativeGdd == null || Number.isNaN(cumulativeGdd)) {
    return null;
  }

  const bands = getGrapeWineGddStageBands(cultivar);
  let stage: GrapeWinePhenologyStage;
  if (cumulativeGdd < bands.budburst) {
    stage = "pre_budburst";
  } else if (cumulativeGdd < bands.flowering) {
    stage = "budburst";
  } else if (cumulativeGdd < bands.veraison) {
    stage = "flowering";
  } else if (cumulativeGdd < bands.harvest) {
    stage = "veraison";
  } else {
    stage = "harvest";
  }

  return {
    stage,
    stage_label: GRAPE_WINE_PHENOLOGY_STAGE_LABELS[stage],
    provenance: getGrapeWineGddProvenance(cultivar),
  };
}

export function lookupElToBbch(
  elNumber: number,
): ElToBbchLookupResult | null {
  for (const row of EL_TO_BBCH_PHASES) {
    if (elNumber >= row.el_min && elNumber <= row.el_max) {
      return {
        phase: row.phase,
        el_min: row.el_min,
        el_max: row.el_max,
        bbch_min: row.bbch_min,
        bbch_max: row.bbch_max,
        bbch_label: `~${row.bbch_min}-${row.bbch_max}`,
      };
    }
  }
  return null;
}

/** Bucket hourly forecast temps into device-local calendar days. */
export function forecastDailyTempsFromHourly(
  hourly: ForecastHourlyTemp[],
  timeZone: string,
): ForecastDailyTemp[] {
  const byDay = new Map<string, number[]>();

  for (const row of hourly) {
    if (row.temperature_2m == null) continue;
    const at = new Date(row.forecast_time);
    if (Number.isNaN(at.getTime())) continue;
    const day = localDayKey(at, timeZone);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(row.temperature_2m);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, temps]) => ({
      day,
      t_max_c: temps.length ? Math.max(...temps) : null,
      t_min_c: temps.length ? Math.min(...temps) : null,
    }));
}

function confidenceForOffset(dayOffset: number): GddConfidence {
  if (dayOffset >= 1 && dayOffset <= 3) return "high";
  if (dayOffset >= 4 && dayOffset <= 7) return "indicative";
  return "indicative";
}

function stageAfterThreshold(
  threshold: GrapeWineGddStageKey,
): GrapeWinePhenologyStage {
  switch (threshold) {
    case "budburst":
      return "budburst";
    case "flowering":
      return "flowering";
    case "veraison":
      return "veraison";
    case "harvest":
      return "harvest";
    default:
      return "pre_budburst";
  }
}

/** Project GDD forward from observed accumulation plus forecast daily max/min. */
export function projectGddFromForecast(options: {
  accumulatedGdd: number;
  forecastDays: ForecastDailyTemp[];
  asOfDay: string;
  cropType?: string | null;
  cultivar?: string | null;
  maxHorizonDays?: number;
}): GddForecastProjection {
  const baseC = getGddBaseC(options.cropType ?? "grape_wine");
  const maxHorizon = options.maxHorizonDays ?? 7;
  const futureDays = options.forecastDays
    .filter((d) => d.day > options.asOfDay)
    .slice(0, maxHorizon);
  const bands = getGrapeWineGddStageBands(options.cultivar);

  let running = options.accumulatedGdd;
  const transitions: StageTransitionProjection[] = [];
  const seenThresholds = new Set<string>();

  const days: GddProjectionDay[] = futureDays.map((row, index) => {
    const dayOffset = index + 1;
    const daily =
      row.t_max_c != null && row.t_min_c != null
        ? gddDay(row.t_max_c, row.t_min_c, baseC)
        : null;
    if (daily != null) {
      running += daily;
    }

    const inferred = inferGrapeWineStage(running, options.cultivar)!;
    const confidence = confidenceForOffset(dayOffset);

    for (const [key, threshold] of Object.entries(bands)) {
      const bandKey = key as GrapeWineGddStageKey;
      if (seenThresholds.has(bandKey)) continue;
      const prevTotal = running - (daily ?? 0);
      if (prevTotal < threshold && running >= threshold) {
        seenThresholds.add(bandKey);
        transitions.push({
          threshold: bandKey,
          threshold_gdd: threshold,
          projected_day: row.day,
          projected_stage: stageAfterThreshold(bandKey),
        });
      }
    }

    return {
      day: row.day,
      day_offset: dayOffset,
      gdd_day: daily,
      cumulative_gdd: running,
      confidence,
      inferred_stage: inferred.stage,
      inferred_stage_label: inferred.stage_label,
    };
  });

  return {
    provenance: getGrapeWineGddProvenance(options.cultivar),
    starting_cumulative_gdd: options.accumulatedGdd,
    days,
    stage_transitions: transitions,
  };
}

export function formatGrapeWineStageLine(
  cumulativeGdd: number | null | undefined,
  cultivar?: string | null,
): string | null {
  const result = inferGrapeWineStage(cumulativeGdd, cultivar);
  if (!result) return null;
  return `${result.stage_label} (provisional)`;
}

export function formatTomatoStageLine(
  cumulativeGdd: number | null | undefined,
): string | null {
  const result = inferTomatoStage(cumulativeGdd);
  if (!result) return null;
  return `${result.stage_label} (provisional)`;
}

export type { ElToBbchPhase, CumulativeGdd };
