import { useEffect, useId, useState } from "react";
import { DEFAULT_STALE_AFTER_MS } from "../lib/api";

export type SystemHealthState = "live" | "degraded" | "offline";

interface SystemStatusLineProps {
  /** True when GET /health succeeded (any HTTP 200). Null before first poll. */
  sidecarReachable: boolean | null;
  /** True when health payload status is "ok". */
  healthOk: boolean | null;
  deviceName: string;
  readingAt: string | null;
  cropType: string;
  lifecycleStage: string;
  lastPollAt: Date | null;
  /** Derived from collector interval (2x); falls back to DEFAULT_STALE_AFTER_MS. */
  staleAfterMs?: number;
  onOpenProfile: () => void;
  /** Promoted open-alert count. Zero renders nothing. Separate from health. */
  openAlertCount?: number;
  worstAlertSeverity?: "info" | "warning" | "critical" | null;
  onOpenAlerts?: () => void;
}

const STATE_GLYPH: Record<SystemHealthState, string> = {
  live: "●",
  degraded: "▲",
  offline: "■",
};

const STATE_LABEL: Record<SystemHealthState, string> = {
  live: "Live",
  degraded: "Degraded",
  offline: "Offline",
};

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Compact relative age that ticks with `nowMs`. */
export function formatRelativeAge(thenMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - thenMs);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}

/**
 * Live: health ok and reading fresher than staleAfterMs.
 * Degraded: health ok but stale/missing reading, or health failing with a
 * recent reading still in hand.
 * Offline: sidecar unreachable.
 */
export function resolveSystemState(
  sidecarReachable: boolean | null,
  healthOk: boolean | null,
  readingAt: string | null,
  nowMs: number,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): SystemHealthState {
  const readingFresh =
    readingAt != null &&
    nowMs - new Date(readingAt).getTime() <= staleAfterMs;

  if (sidecarReachable === false) {
    return "offline";
  }

  if (sidecarReachable === null) {
    return readingFresh ? "degraded" : "offline";
  }

  if (!healthOk) {
    return readingFresh ? "degraded" : "offline";
  }

  if (!readingFresh) return "degraded";
  return "live";
}

export function SystemStatusLine({
  sidecarReachable,
  healthOk,
  deviceName,
  readingAt,
  cropType,
  lifecycleStage,
  lastPollAt,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  onOpenProfile,
  openAlertCount = 0,
  worstAlertSeverity = null,
  onOpenAlerts,
}: SystemStatusLineProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const state = resolveSystemState(
    sidecarReachable,
    healthOk,
    readingAt,
    nowMs,
    staleAfterMs,
  );
  const readingAge = readingAt
    ? formatRelativeAge(new Date(readingAt).getTime(), nowMs)
    : null;
  const pollAge = lastPollAt
    ? formatRelativeAge(lastPollAt.getTime(), nowMs)
    : null;

  function toggle() {
    setExpanded((v) => !v);
  }

  return (
    <div className={`system-status system-status-${state}`}>
      <div className="system-status-line">
        <button
          type="button"
          className="system-status-expand"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span className="system-status-state" title={STATE_LABEL[state]}>
            <span className="system-status-glyph" aria-hidden="true">
              {STATE_GLYPH[state]}
            </span>
            <span className="system-status-label">{STATE_LABEL[state]}</span>
          </span>
          <span className="system-status-sep" aria-hidden="true">
            ·
          </span>
          <span className="system-status-device">{deviceName}</span>
          <span className="system-status-sep" aria-hidden="true">
            ·
          </span>
          <span className="system-status-reading">
            {readingAge ? `reading ${readingAge} ago` : "no reading"}
          </span>
          {pollAge !== null && (
            <>
              <span className="system-status-sep" aria-hidden="true">
                ·
              </span>
              <span className="system-status-poll">updated {pollAge} ago</span>
            </>
          )}
          <span className="system-status-chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
        </button>
        <button
          type="button"
          className="system-status-profile-chip"
          onClick={onOpenProfile}
        >
          {cropType}/{lifecycleStage}
        </button>
        {openAlertCount > 0 && (
          <button
            type="button"
            className={`system-status-alert-badge system-status-alert-${worstAlertSeverity ?? "info"}`}
            onClick={onOpenAlerts}
            title="Open alerts"
            aria-label={`${openAlertCount} open alerts`}
          >
            {openAlertCount} alert{openAlertCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {expanded && (
        <div
          id={panelId}
          className="system-status-detail"
          role="region"
          aria-label="System status detail"
        >
          <dl className="system-status-dl">
            <div>
              <dt>Sidecar</dt>
              <dd>
                {sidecarReachable === null
                  ? "checking…"
                  : sidecarReachable
                    ? healthOk
                      ? "reachable (8731)"
                      : "reachable, health not ok"
                    : "unreachable"}
              </dd>
            </div>
            <div>
              <dt>Last reading</dt>
              <dd>
                {readingAt
                  ? `${formatAbsolute(readingAt)} (${readingAge} ago)`
                  : "none"}
              </dd>
            </div>
            <div>
              <dt>Last poll</dt>
              <dd>
                {lastPollAt
                  ? `${formatAbsolute(lastPollAt.toISOString())} (${pollAge} ago)`
                  : "none"}
              </dd>
            </div>
            <div>
              <dt>Stale after</dt>
              <dd>
                {staleAfterMs >= 60_000
                  ? `${Math.round(staleAfterMs / 60_000)} min`
                  : `${Math.round(staleAfterMs / 1000)} s`}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
