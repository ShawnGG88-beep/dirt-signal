/**
 * Pure builders for weather-horizon consequence lanes.
 *
 * Lane kinds are open-ended so grape disease modules can append later
 * without changing the renderer. Digest-backed lanes (spray, frost) only
 * emit when device_advisories_daily supports them. Storm is client-side.
 * Water use is FAO ET0 from the forecast, never described as irrigation.
 */

import type {
  DailyAdvisoryDigestPayload,
  WeatherForecastHour,
} from "../data/types";
import { localDayKey } from "./dayNight";
import {
  evaluateStormRisk,
  type StormRiskResult,
} from "./stormRisk";

/** Visual pattern (colour alone is not enough). */
export type LanePattern = "solid" | "hatch" | "outline" | "sparkline";

/**
 * Known kinds. String remains open so future modules (e.g. grape disease)
 * can introduce new ids without a renderer change.
 */
export type ConsequenceLaneKind =
  | "spray"
  | "frost"
  | "water_use"
  | "storm"
  | (string & {});

export interface ConsequenceLaneSegment {
  /** Inclusive window start (ISO). */
  start: string;
  /** Inclusive window end (ISO). */
  end: string;
  /** Short label for tooltips / day tags. */
  label?: string;
  /** Optional 0–1 intensity for future risk modules. */
  intensity?: number;
}

export interface ConsequenceLane {
  id: string;
  kind: ConsequenceLaneKind;
  title: string;
  pattern: LanePattern;
  /** Advisory notify remains off: every digest lane shows this. */
  shadowMode: boolean;
  provisional?: boolean;
  /** Hourly band segments vs day-level tags. */
  granularity: "hourly" | "daily";
  segments: ConsequenceLaneSegment[];
  summary: string;
  /** Hourly ET0 samples aligned to the visible band (water_use only). */
  sparkline?: Array<number | null>;
  /** True when this lane is an actionable advisory (not informational ET0). */
  actionable: boolean;
}

export interface ConsequenceLanesResult {
  lanes: ConsequenceLane[];
  /** True when no actionable lane has content in the visible window. */
  nothingToActOn: boolean;
  storm: StormRiskResult;
}

export interface BuildConsequenceLanesInput {
  digest: DailyAdvisoryDigestPayload | null | undefined;
  hours: WeatherForecastHour[];
  /** Visible window start (ISO or Date). Defaults to first hour. */
  windowStart?: string | Date | null;
  /** Visible window end (ISO or Date). Defaults to last hour. */
  windowEnd?: string | Date | null;
  timeZone: string;
  /** Prefer day-level aggregation (7-day horizon). */
  aggregateDaily?: boolean;
}

function toMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function clipSegment(
  startIso: string,
  endIso: string,
  winStartMs: number,
  winEndMs: number,
): ConsequenceLaneSegment | null {
  const startMs = toMs(startIso);
  const endMs = toMs(endIso);
  if (startMs == null || endMs == null) return null;
  const clippedStart = Math.max(startMs, winStartMs);
  const clippedEnd = Math.min(endMs, winEndMs);
  if (clippedEnd < clippedStart) return null;
  return {
    start: new Date(clippedStart).toISOString(),
    end: new Date(clippedEnd).toISOString(),
  };
}

function windowBounds(
  hours: WeatherForecastHour[],
  windowStart?: string | Date | null,
  windowEnd?: string | Date | null,
): { startMs: number; endMs: number } | null {
  if (hours.length === 0) return null;
  const first = toMs(hours[0].forecast_time);
  const last = toMs(hours[hours.length - 1].forecast_time);
  if (first == null || last == null) return null;
  const startMs = toMs(windowStart) ?? first;
  const endMs = toMs(windowEnd) ?? last;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startMs, endMs };
}

function buildSprayLane(
  digest: DailyAdvisoryDigestPayload | null | undefined,
  win: { startMs: number; endMs: number },
  aggregateDaily: boolean,
  timeZone: string,
): ConsequenceLane | null {
  const spray = digest?.spray_window;
  if (!spray?.found || !spray.window_start || !spray.window_end) return null;
  const clipped = clipSegment(
    spray.window_start,
    spray.window_end,
    win.startMs,
    win.endMs,
  );
  if (!clipped) return null;

  if (aggregateDaily) {
    const day = localDayKey(new Date(clipped.start), timeZone);
    return {
      id: "spray",
      kind: "spray",
      title: "Spray window",
      pattern: "solid",
      shadowMode: true,
      granularity: "daily",
      segments: [
        {
          start: `${day}T00:00:00.000Z`,
          end: `${day}T23:59:59.999Z`,
          label: "Spray",
        },
      ],
      summary: spray.message || "Spray window in range.",
      actionable: true,
    };
  }

  return {
    id: "spray",
    kind: "spray",
    title: "Spray window",
    pattern: "solid",
    shadowMode: true,
    granularity: "hourly",
    segments: [clipped],
    summary: spray.message || "Spray window in range.",
    actionable: true,
  };
}

interface TomatoChillNight {
  date?: string;
  low_c?: number;
  tier?: string;
}

interface TomatoChillBlock {
  nights?: TomatoChillNight[];
  highest_tier?: string | null;
  message?: string;
}

function buildFrostLane(
  digest: DailyAdvisoryDigestPayload | null | undefined,
  win: { startMs: number; endMs: number },
): ConsequenceLane | null {
  const tomato = digest?.tomato;
  if (!tomato || typeof tomato !== "object") return null;
  const chill = (tomato as { chill?: TomatoChillBlock }).chill;
  if (!chill) return null;

  const frostNights = (chill.nights ?? []).filter(
    (n) => n.tier === "frost" && typeof n.date === "string",
  );

  const segments: ConsequenceLaneSegment[] = [];
  for (const night of frostNights) {
    const day = night.date!;
    // Day tag: noon UTC of that local calendar day is enough for placement.
    const start = `${day}T00:00:00.000Z`;
    const end = `${day}T23:59:59.999Z`;
    const clipped = clipSegment(start, end, win.startMs, win.endMs);
    if (!clipped) continue;
    segments.push({
      ...clipped,
      label:
        night.low_c != null && Number.isFinite(night.low_c)
          ? `Frost ${night.low_c.toFixed(1)}°`
          : "Frost",
    });
  }

  // Digest may flag frost via highest_tier without nights in-window.
  if (
    segments.length === 0 &&
    chill.highest_tier === "frost" &&
    chill.message
  ) {
    // Day-level tag spanning the visible window when nights are missing.
    segments.push({
      start: new Date(win.startMs).toISOString(),
      end: new Date(win.endMs).toISOString(),
      label: "Frost risk",
    });
  }

  if (segments.length === 0) return null;

  return {
    id: "frost",
    kind: "frost",
    title: "Frost risk",
    pattern: "hatch",
    shadowMode: true,
    provisional: true,
    granularity: "daily",
    segments,
    summary: chill.message || "Frost risk in the forecast window.",
    actionable: true,
  };
}

function buildWaterUseLane(
  hours: WeatherForecastHour[],
): ConsequenceLane | null {
  if (hours.length === 0) return null;
  const sparkline = hours.map((h) =>
    h.et0_fao_evapotranspiration != null &&
    Number.isFinite(h.et0_fao_evapotranspiration)
      ? h.et0_fao_evapotranspiration
      : null,
  );
  if (!sparkline.some((v) => v != null)) return null;

  const values = sparkline.filter((v): v is number => v != null);
  const sum = values.reduce((a, b) => a + b, 0);
  const start = hours[0].forecast_time;
  const end = hours[hours.length - 1].forecast_time;

  return {
    id: "water_use",
    kind: "water_use",
    title: "Water use (ET0)",
    pattern: "sparkline",
    shadowMode: true,
    granularity: "hourly",
    segments: [{ start, end, label: "ET0" }],
    summary: `Water use (ET0) ${sum.toFixed(1)} mm over the visible window.`,
    sparkline,
    actionable: false,
  };
}

function mergeStormHitsToSegments(
  storm: StormRiskResult,
  win: { startMs: number; endMs: number },
  aggregateDaily: boolean,
  timeZone: string,
): ConsequenceLaneSegment[] {
  if (!storm.active) return [];
  if (aggregateDaily) {
    const byDay = new Map<string, ConsequenceLaneSegment>();
    for (const hit of storm.hits) {
      const t = toMs(hit.forecast_time);
      if (t == null || t < win.startMs || t > win.endMs) continue;
      const day = localDayKey(new Date(hit.forecast_time), timeZone);
      if (byDay.has(day)) continue;
      byDay.set(day, {
        start: `${day}T00:00:00.000Z`,
        end: `${day}T23:59:59.999Z`,
        label:
          hit.reason === "gust_threshold" ? "High gusts" : "Thunderstorm",
      });
    }
    return [...byDay.values()];
  }

  // Merge contiguous storm hours into windows (±30 min around each hit).
  const sorted = [...storm.hits]
    .map((h) => ({ ...h, ms: toMs(h.forecast_time) }))
    .filter((h) => h.ms != null && h.ms! >= win.startMs && h.ms! <= win.endMs)
    .sort((a, b) => a.ms! - b.ms!);

  const segments: ConsequenceLaneSegment[] = [];
  let cur: ConsequenceLaneSegment | null = null;
  for (const hit of sorted) {
    const hourStart = hit.ms!;
    const hourEnd = hourStart + 60 * 60 * 1000;
    if (!cur) {
      cur = {
        start: new Date(hourStart).toISOString(),
        end: new Date(hourEnd).toISOString(),
        label:
          hit.reason === "gust_threshold" ? "High gusts" : "Thunderstorm",
      };
      continue;
    }
    const curEnd = toMs(cur.end)!;
    if (hourStart <= curEnd + 60 * 60 * 1000) {
      cur.end = new Date(Math.max(curEnd, hourEnd)).toISOString();
    } else {
      segments.push(cur);
      cur = {
        start: new Date(hourStart).toISOString(),
        end: new Date(hourEnd).toISOString(),
        label:
          hit.reason === "gust_threshold" ? "High gusts" : "Thunderstorm",
      };
    }
  }
  if (cur) segments.push(cur);
  return segments;
}

function buildStormLane(
  hours: WeatherForecastHour[],
  win: { startMs: number; endMs: number },
  aggregateDaily: boolean,
  timeZone: string,
): { lane: ConsequenceLane | null; storm: StormRiskResult } {
  const storm = evaluateStormRisk(hours, {
    fromAt: new Date(win.startMs),
    toAt: new Date(win.endMs),
  });
  const segments = mergeStormHitsToSegments(
    storm,
    win,
    aggregateDaily,
    timeZone,
  );
  if (segments.length === 0) {
    return { lane: null, storm };
  }
  return {
    storm,
    lane: {
      id: "storm",
      kind: "storm",
      title: "Storm risk",
      pattern: "outline",
      shadowMode: true,
      provisional: true,
      granularity: aggregateDaily ? "daily" : "hourly",
      segments,
      summary:
        storm.hits[0]?.reason === "gust_threshold"
          ? `Storm risk: gusts at or above ${storm.gust_threshold_kmh} km/h.`
          : "Storm risk: thunderstorm weather codes in the window.",
      actionable: true,
    },
  };
}

/**
 * Build consequence lanes for the visible forecast window.
 * Order is fixed for stable layout; unknown future kinds append after.
 */
export function buildConsequenceLanes(
  input: BuildConsequenceLanesInput,
): ConsequenceLanesResult {
  const {
    digest,
    hours,
    windowStart,
    windowEnd,
    timeZone,
    aggregateDaily = false,
  } = input;
  const win = windowBounds(hours, windowStart, windowEnd);
  if (!win) {
    return {
      lanes: [],
      nothingToActOn: true,
      storm: evaluateStormRisk([]),
    };
  }

  const lanes: ConsequenceLane[] = [];
  const spray = buildSprayLane(digest, win, aggregateDaily, timeZone);
  if (spray) lanes.push(spray);

  const frost = buildFrostLane(digest, win);
  if (frost) lanes.push(frost);

  const water = buildWaterUseLane(hours);
  if (water) lanes.push(water);

  const { lane: stormLane, storm } = buildStormLane(
    hours,
    win,
    aggregateDaily,
    timeZone,
  );
  if (stormLane) lanes.push(stormLane);

  const nothingToActOn = !lanes.some((l) => l.actionable);

  return { lanes, nothingToActOn, storm };
}

/** Map a timestamp onto [0, 1] across the visible hour band. */
export function laneSegmentFrac(
  iso: string,
  hours: WeatherForecastHour[],
): number | null {
  if (hours.length === 0) return null;
  const t = toMs(iso);
  const start = toMs(hours[0].forecast_time);
  const end = toMs(hours[hours.length - 1].forecast_time);
  if (t == null || start == null || end == null || end <= start) return null;
  return Math.min(1, Math.max(0, (t - start) / (end - start)));
}
