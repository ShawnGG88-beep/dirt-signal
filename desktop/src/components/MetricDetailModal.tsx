import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchEvents,
  fetchReadingsRange,
  HISTORY_FETCH_LIMIT,
  type PlantEvent,
  type SensorReading,
} from "../lib/api";
import { DEFAULT_DEVICE_TIMEZONE } from "../lib/dayNight";
import {
  extractMetricValues,
  formatMetricValue,
  getMetric,
  rangeFromPreset,
  type MetricKey,
  type RangePreset,
} from "../lib/metrics";
import {
  loadEventFilter,
  saveEventFilter,
  type PlantEventTypeKey,
} from "../lib/eventTypes";
import { computeStats, type TrendDirection } from "../lib/stats";
import { EventTypeFilter } from "./EventMarkerRail";
import { ExportButton } from "./ExportButton";
import { RangePicker } from "./RangePicker";
import { TimeSeriesChart } from "./TimeSeriesChart";

const DEVICE_NAME = "pi-garden-01";
const FILTER_VIEW = "metric-detail";

const TREND_LABEL: Record<TrendDirection, string> = {
  rising: "rising",
  falling: "falling",
  stable: "stable",
};

const TREND_SYMBOL: Record<TrendDirection, string> = {
  rising: "↑",
  falling: "↓",
  stable: "→",
};

interface MetricDetailModalProps {
  metricKey: MetricKey;
  range: RangePreset;
  onRangeChange: (range: RangePreset) => void;
  onClose: () => void;
  deviceCropType?: string;
  deviceLifecycleStage?: string;
  /** Bump to refresh events after Dashboard log. */
  eventsEpoch?: number;
  onEventsChanged?: () => void;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  return [...nodes].filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
  );
}

export function MetricDetailModal({
  metricKey,
  range: preset,
  onRangeChange,
  onClose,
  deviceCropType = "tomato",
  deviceLifecycleStage = "mature",
  eventsEpoch = 0,
  onEventsChanged,
}: MetricDetailModalProps) {
  const metric = getMetric(metricKey);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [events, setEvents] = useState<PlantEvent[]>([]);
  const [timeZone, setTimeZone] = useState(DEFAULT_DEVICE_TIMEZONE);
  const [from, setFrom] = useState(() => rangeFromPreset(preset).from);
  const [to, setTo] = useState(() => rangeFromPreset(preset).to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<PlantEventTypeKey>>(
    () => loadEventFilter(FILTER_VIEW),
  );
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshEvents = useCallback(async (fromAt: Date, toAt: Date) => {
    const result = await fetchEvents({
      deviceName: DEVICE_NAME,
      fromAt,
      toAt,
      limit: 2000,
    });
    setEvents(result.events);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel) {
      const focusable = getFocusable(panel);
      (focusable[0] ?? panel).focus();
    }
  }, []);

  useEffect(() => {
    const { from: nextFrom, to: nextTo } = rangeFromPreset(preset);
    setFrom(nextFrom);
    setTo(nextTo);
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [range, eventsResult] = await Promise.all([
          fetchReadingsRange(
            nextFrom,
            nextTo,
            DEVICE_NAME,
            HISTORY_FETCH_LIMIT,
          ),
          fetchEvents({
            deviceName: DEVICE_NAME,
            fromAt: nextFrom,
            toAt: nextTo,
            limit: 2000,
          }),
        ]);
        if (!cancelled) {
          setReadings(range.readings);
          setEvents(eventsResult.events);
          setTimeZone(range.timezone ?? DEFAULT_DEVICE_TIMEZONE);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load range");
          setReadings([]);
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [preset, eventsEpoch]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const values = extractMetricValues(readings, metricKey);
  const stats = computeStats(values);

  function onFilterChange(next: Set<PlantEventTypeKey>) {
    setEnabledTypes(next);
    saveEventFilter(FILTER_VIEW, next);
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metric-detail-title"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div>
            <h2 id="metric-detail-title">{metric.label}</h2>
            <p className="subtitle">
              Detail · {preset} · {readings.length} points · {events.length}{" "}
              events
            </p>
          </div>
          <div className="modal-actions">
            <ExportButton
              readings={readings}
              events={events}
              from={from}
              to={to}
              prefix={`dirt-signal-${metric.key}`}
            />
            <button type="button" className="refresh-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="modal-toolbar">
          <RangePicker value={preset} onChange={onRangeChange} />
        </div>

        {error && <div className="error-banner">{error}</div>}
        {loading && <p className="view-status">Loading…</p>}

        {!loading && (
          <>
            <EventTypeFilter enabled={enabledTypes} onChange={onFilterChange} />
            <TimeSeriesChart
              readings={readings}
              metricKey={metricKey}
              colour={metric.colour}
              height={320}
              deviceCropType={deviceCropType}
              deviceLifecycleStage={deviceLifecycleStage}
              timeZone={timeZone}
              segmentByProfile={!metric.derived}
              events={events}
              fromAt={from}
              toAt={to}
              enabledEventTypes={enabledTypes}
              onEventsChanged={() => {
                void refreshEvents(from, to);
                onEventsChanged?.();
              }}
            />

            <section className="stats-grid">
              <StatCell
                label="Min"
                value={formatMetricValue(stats?.min, metric.unit)}
              />
              <StatCell
                label="Max"
                value={formatMetricValue(stats?.max, metric.unit)}
              />
              <StatCell
                label="Mean"
                value={formatMetricValue(stats?.mean, metric.unit)}
              />
              <StatCell
                label="Std dev"
                value={formatMetricValue(stats?.std, metric.unit)}
              />
              <div className="stat-cell stat-cell-trend">
                <span className="stat-label">Trend</span>
                <span
                  className={`trend-badge trend-${stats?.trend ?? "stable"}`}
                >
                  {stats
                    ? `${TREND_SYMBOL[stats.trend]} ${TREND_LABEL[stats.trend]}`
                    : "n/a"}
                </span>
                <span className="stat-hint">
                  first half vs second half of range
                </span>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-cell">
      <span className="stat-label">{label}</span>
      <span className="stat-value tabular-nums">{value}</span>
    </div>
  );
}
