import type { MetricBounds, MetricStatus } from "../lib/metrics";
import type { ScoringSemantic } from "../lib/growingConstants";

interface BandPositionBarProps {
  bounds: MetricBounds | null;
  position: number | null;
  status: MetricStatus;
  scoringSemantic: ScoringSemantic;
  disabled?: boolean;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function formatBound(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Horizontal track for a metric's scored range.
 * optimal_band: in-bounds centre shaded; out-of-bounds either side.
 * restraint: acceptable-below / elevated-above split at the upper watch bound.
 */
export function BandPositionBar({
  bounds,
  position,
  status,
  scoringSemantic,
  disabled = false,
}: BandPositionBarProps) {
  if (disabled || !bounds || position === null) {
    return (
      <div
        className="band-bar band-bar-disabled"
        role="img"
        aria-label="No scored band"
      >
        <div className="band-bar-track">
          <div
            className="band-bar-region band-bar-unknown"
            style={{ left: 0, width: "100%" }}
          />
        </div>
        <div className="band-bar-labels">
          <span>—</span>
          <span>—</span>
        </div>
      </div>
    );
  }

  const bandWidth = bounds.max - bounds.min;
  const pad = bandWidth === 0 ? 1 : bandWidth * 0.25;
  const watchFracOfBand = 0.1;

  let domainMin: number;
  let domainMax: number;
  let inLeft: number;
  let inRight: number;
  let watchZones: { left: number; right: number }[] = [];

  if (scoringSemantic === "restraint") {
    // Domain: min … max + pad. Acceptable fills min→max; elevated is above max.
    domainMin = bounds.min;
    domainMax = bounds.max + pad;
    const span = domainMax - domainMin || 1;
    inLeft = 0;
    inRight = (bounds.max - domainMin) / span;
    watchZones = [
      {
        left: (bounds.max - watchFracOfBand * (bandWidth || pad) - domainMin) / span,
        right: inRight,
      },
    ];
  } else {
    domainMin = bounds.min - pad;
    domainMax = bounds.max + pad;
    const span = domainMax - domainMin || 1;
    inLeft = (bounds.min - domainMin) / span;
    inRight = (bounds.max - domainMin) / span;
    const watchW = (watchFracOfBand * (bandWidth || pad)) / span;
    watchZones = [
      { left: inLeft, right: inLeft + watchW },
      { left: inRight - watchW, right: inRight },
    ];
  }

  const span = domainMax - domainMin || 1;
  const valueApprox = bounds.min + position * (bandWidth || 1);
  const rawMarker = (valueApprox - domainMin) / span;
  const exceededLow = rawMarker < 0;
  const exceededHigh = rawMarker > 1;
  const markerPct = clamp01(rawMarker) * 100;

  const statusClass =
    status === "watch"
      ? "band-marker-watch"
      : status === "warn" || status === "elevated"
        ? "band-marker-out"
        : status === "ok"
          ? "band-marker-ok"
          : "band-marker-unknown";

  const aria =
    scoringSemantic === "restraint"
      ? `Value at ${(position * 100).toFixed(0)} percent of watch band, status ${status}`
      : `Value at ${(position * 100).toFixed(0)} percent of optimal band, status ${status}`;

  return (
    <div className="band-bar" role="img" aria-label={aria}>
      <div
        className={
          scoringSemantic === "restraint"
            ? "band-bar-track band-bar-track-restraint"
            : "band-bar-track"
        }
      >
        <div
          className="band-bar-region band-bar-oob"
          style={{ left: "0%", width: "100%" }}
        />
        <div
          className={
            scoringSemantic === "restraint"
              ? "band-bar-region band-bar-acceptable"
              : "band-bar-region band-bar-in"
          }
          style={{
            left: `${inLeft * 100}%`,
            width: `${(inRight - inLeft) * 100}%`,
          }}
        />
        {watchZones.map((z, i) => (
          <div
            key={i}
            className="band-bar-region band-bar-watch-zone"
            style={{
              left: `${z.left * 100}%`,
              width: `${Math.max(0, z.right - z.left) * 100}%`,
            }}
          />
        ))}
        <div
          className={`band-bar-marker ${statusClass}${exceededLow || exceededHigh ? " band-bar-marker-exceeded" : ""}`}
          style={{ left: `${markerPct}%` }}
          data-exceeded={
            exceededLow ? "low" : exceededHigh ? "high" : undefined
          }
        />
      </div>
      <div className="band-bar-labels">
        <span className="band-bar-num">{formatBound(bounds.min)}</span>
        <span className="band-bar-num">
          {scoringSemantic === "restraint"
            ? `watch ${formatBound(bounds.max)}`
            : formatBound(bounds.max)}
        </span>
      </div>
    </div>
  );
}
