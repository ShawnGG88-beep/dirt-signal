import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { BandPositionBar } from "./BandPositionBar";
import { SemanticStatusBadge } from "./SemanticStatus";
import { Sparkline } from "./Sparkline";
import { metricToTileStatus } from "../lib/dashboardStatus";
import { formatUpdatedAgo } from "../lib/formatTime";
import { useAnimatedNumber } from "../lib/useAnimatedNumber";
import { usePrefersReducedMotion } from "../lib/accessibility";
import type { ScoringSemantic } from "../lib/growingConstants";
import {
  formatMetricValue,
  type MetricDef,
  type MetricScore,
} from "../lib/metrics";

export interface SensorTileProps {
  metric: MetricDef;
  value: number | null | undefined;
  score: MetricScore;
  sparkValues: number[];
  scoringSemantic: ScoringSemantic;
  recordedAt: string | null;
  nowMs: number;
  staleAfterMs: number;
  fetching?: boolean;
  rangeError?: string | null;
  onRetryRange?: () => void;
  onOpen: () => void;
  /** From collector config when exposed; marks mock streams. */
  simulated?: boolean;
  footnote?: string | null;
}

/**
 * L1 sensor tile: Recursive MONO value, 24h sparkline, band, status, freshness.
 */
export function SensorTile({
  metric,
  value,
  score,
  sparkValues,
  scoringSemantic,
  recordedAt,
  nowMs,
  staleAfterMs,
  fetching = false,
  rangeError = null,
  onRetryRange,
  onOpen,
  simulated = false,
  footnote = null,
}: SensorTileProps) {
  const isNull = value === null || value === undefined;
  const tileStatus = metricToTileStatus(score, {
    isNull,
    recordedAt,
    nowMs,
    staleAfterMs,
  });
  const reduceMotion = usePrefersReducedMotion();
  const { display, justUpdated } = useAnimatedNumber(isNull ? null : value);
  const displayValue =
    display == null ? value : display;

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  const glowClass = justUpdated
    ? reduceMotion
      ? " is-updated-static"
      : " is-updated"
    : "";

  return (
    <div
      className={`sensor-tile glass-l1${fetching ? " is-fetching" : ""}${
        tileStatus.status === "stale" ? " is-stale" : ""
      }${glowClass}`}
      data-sensor-tile={metric.key}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={`${metric.label}: ${formatMetricValue(value, metric.unit)}, ${tileStatus.label}`}
    >
      <div className="sensor-tile-header">
        <span className="sensor-tile-label">{metric.label}</span>
        {simulated ? (
          <span className="sensor-tile-simulated">Simulated</span>
        ) : null}
      </div>
      <p className="sensor-tile-value font-telemetry">
        {formatMetricValue(displayValue, metric.unit)}
      </p>
      <BandPositionBar
        bounds={score.bounds}
        position={score.position}
        status={
          score.reason === "needs_calibration" ? "watch" : score.status
        }
        scoringSemantic={scoringSemantic}
        disabled={isNull || score.bounds === null}
      />
      <div className="sensor-tile-status-row">
        <SemanticStatusBadge status={tileStatus.status} label={tileStatus.label} />
      </div>
      {footnote ? <p className="sensor-tile-footnote muted">{footnote}</p> : null}
      <div
        className="sensor-tile-spark"
        role="img"
        aria-label={`${metric.label} 24 hour trend`}
      >
        {rangeError ? (
          <button
            type="button"
            className="metric-inline-retry"
            onClick={(e) => {
              e.stopPropagation();
              onRetryRange?.();
            }}
          >
            Sparkline failed · retry
          </button>
        ) : (
          <Sparkline
            values={sparkValues}
            bounds={score.bounds}
            width={160}
            height={36}
          />
        )}
      </div>
      <p className="sensor-tile-fresh muted">
        {formatUpdatedAgo(recordedAt, nowMs)}
      </p>
    </div>
  );
}
