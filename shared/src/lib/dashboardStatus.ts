/**
 * Pure helpers for Phase 4 dashboard information architecture:
 * status sentence, semantic tile status mapping, needs-attention items.
 */

import type { SemanticStatus } from "../components/SemanticStatus";
import { formatUpdatedAgo } from "./formatTime";
import type { ConsequenceLane } from "./consequenceLanes";
import type { MetricScore, MetricStatus } from "./metrics";

export interface TileStatusView {
  status: SemanticStatus;
  /** Sentence-case label shown with the status icon. */
  label: string;
}

/**
 * Map MetricScore (+ freshness) onto the redesign vocabulary
 * ok / watch / act / cold / stale.
 *
 * Existing dashboard strings:
 * - "needs field calibration" → watch (reason needs_calibration)
 * - "out of bounds" → act (MetricStatus warn / error)
 * - grape cold soil zones (dormant / impaired) → cold
 * - stale reading age → stale (overrides value status)
 */
export function metricToTileStatus(
  score: MetricScore,
  options?: {
    isNull?: boolean;
    recordedAt?: string | null;
    nowMs?: number;
    staleAfterMs?: number;
  },
): TileStatusView {
  const nowMs = options?.nowMs ?? Date.now();
  const staleAfter = options?.staleAfterMs ?? 60_000;
  if (options?.recordedAt) {
    const t = new Date(options.recordedAt).getTime();
    if (Number.isFinite(t) && nowMs - t > staleAfter) {
      return { status: "stale", label: "Stale" };
    }
  }

  if (options?.isNull || score.reason === "no_value") {
    return { status: "stale", label: "unknown" };
  }

  if (score.reason === "needs_calibration") {
    return { status: "watch", label: "needs field calibration" };
  }

  if (score.reason === "no_band") {
    return { status: "watch", label: "unknown" };
  }

  if (
    score.zoneId === "dormant" ||
    score.zoneId === "impaired"
  ) {
    return {
      status: "cold",
      label: score.zoneLabel ?? "Cold",
    };
  }

  return mapMetricStatus(score.status, score.zoneLabel);
}

function mapMetricStatus(
  status: MetricStatus,
  zoneLabel?: string,
): TileStatusView {
  switch (status) {
    case "ok":
      return { status: "ok", label: zoneLabel ?? "Within range" };
    case "watch":
      return { status: "watch", label: zoneLabel ?? "Watch" };
    case "elevated":
      return { status: "act", label: zoneLabel ?? "elevated" };
    case "warn":
    case "error":
      return { status: "act", label: zoneLabel ?? "out of bounds" };
    case "unknown":
    default:
      return { status: "watch", label: "unknown" };
  }
}

export interface StatusSentenceInput {
  metricLabels: string[];
  /** Metrics currently reporting a finite value. */
  reportingCount: number;
  moistureSteady?: boolean | null;
  moistureLabel?: string | null;
  /** Short lane / attention clauses, already sentence-cased. */
  attentionClauses: string[];
}

/** One plain grower-facing line. No AI. */
export function buildStatusSentence(input: StatusSentenceInput): string {
  const total = input.metricLabels.length;
  const reporting = input.reportingCount;
  const sensorBit =
    total === 0
      ? "No sensors configured."
      : reporting === total
        ? `All ${total} sensors reporting.`
        : reporting === 0
          ? "No sensors reporting."
          : `${reporting} of ${total} sensors reporting.`;

  const parts: string[] = [sensorBit];

  if (input.moistureLabel) {
    parts.push(input.moistureLabel);
  } else if (input.moistureSteady === true) {
    parts.push("Soil moisture steady.");
  } else if (input.moistureSteady === false) {
    parts.push("Soil moisture changing.");
  }

  for (const clause of input.attentionClauses) {
    const trimmed = clause.trim();
    if (!trimmed) continue;
    parts.push(trimmed.endsWith(".") ? trimmed : `${trimmed}.`);
  }

  return parts.join(" ");
}

export interface NeedsAttentionItem {
  id: string;
  title: string;
  detail: string;
  status: SemanticStatus;
}

/**
 * Elevate act-level metric scores and significant consequence lanes.
 * Watch/calibration alone does not open the section.
 * Stale readings keep the underlying act/cold reason but state age inline
 * so growers cannot mistake old data for a live problem.
 */
export function buildNeedsAttentionItems(input: {
  metrics: Array<{
    key: string;
    label: string;
    score: MetricScore;
    isNull?: boolean;
    recordedAt?: string | null;
  }>;
  lanes: ConsequenceLane[];
  nowMs?: number;
  staleAfterMs?: number;
}): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  const nowMs = input.nowMs ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? 60_000;

  for (const metric of input.metrics) {
    if (metric.isNull) continue;
    const live = metricToTileStatus(metric.score);
    if (live.status !== "act" && live.status !== "cold") continue;

    const readingStale = isReadingStale(
      metric.recordedAt,
      nowMs,
      staleAfterMs,
    );
    if (readingStale && metric.recordedAt) {
      const ago = formatUpdatedAgo(metric.recordedAt, nowMs).replace(
        /^Updated /,
        "",
      );
      items.push({
        id: `metric:${metric.key}`,
        title: metric.label,
        detail: `was ${live.label}, last reading ${ago}`,
        status: "stale",
      });
    } else {
      items.push({
        id: `metric:${metric.key}`,
        title: metric.label,
        detail: live.label,
        status: live.status,
      });
    }
  }

  for (const lane of input.lanes) {
    if (!lane.actionable) continue;
    items.push({
      id: `lane:${lane.id}`,
      title: lane.title,
      detail: lane.summary,
      status: lane.kind === "frost" ? "cold" : "act",
    });
  }

  return items;
}

function isReadingStale(
  recordedAt: string | null | undefined,
  nowMs: number,
  staleAfterMs: number,
): boolean {
  if (!recordedAt) return false;
  const t = new Date(recordedAt).getTime();
  return Number.isFinite(t) && nowMs - t > staleAfterMs;
}

/** Short clauses for the status sentence from actionable lanes. */
export function attentionClausesFromLanes(
  lanes: ConsequenceLane[],
  timeZone = "UTC",
): string[] {
  const clauses: string[] = [];
  for (const lane of lanes) {
    if (!lane.actionable) continue;
    if (lane.kind === "spray") {
      clauses.push(sprayWindowClause(lane, timeZone));
      continue;
    }
    if (lane.kind === "storm") {
      clauses.push("Storm risk ahead");
      continue;
    }
    if (lane.kind === "frost") {
      clauses.push("Frost risk overnight");
      continue;
    }
    clauses.push(lane.title);
  }
  return clauses;
}

function sprayWindowClause(lane: ConsequenceLane, timeZone: string): string {
  const startIso = lane.segments[0]?.start;
  if (!startIso) return "Spray window open";
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return "Spray window open";
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone,
  }).format(start);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).format(start),
  );
  const partOfDay =
    hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Spray window ${weekday} ${partOfDay}`;
}

/** True when sparkline values are nearly flat across the window. */
export function sparklineIsSteady(
  values: number[],
  relativeEpsilon = 0.02,
): boolean | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  const span = Math.max(...values) - Math.min(...values);
  const scale = Math.max(Math.abs(first), Math.abs(last), 1);
  return span / scale <= relativeEpsilon && Math.abs(last - first) / scale <= relativeEpsilon;
}
