import { useEffect, useState } from "react";
import {
  fetchReadingsRange,
  HISTORY_FETCH_LIMIT,
  type SensorReading,
} from "../lib/api";
import {
  extractMetricValues,
  formatMetricValue,
  getMetric,
  rangeFromPreset,
  type MetricKey,
  type RangePreset,
} from "../lib/metrics";
import { computeStats, type TrendDirection } from "../lib/stats";
import { ExportButton } from "./ExportButton";
import { RangePicker } from "./RangePicker";
import { TimeSeriesChart } from "./TimeSeriesChart";

const DEVICE_NAME = "pi-garden-01";

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
  onClose: () => void;
}

export function MetricDetailModal({
  metricKey,
  onClose,
}: MetricDetailModalProps) {
  const metric = getMetric(metricKey);
  const [preset, setPreset] = useState<RangePreset>("6h");
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [from, setFrom] = useState(() => rangeFromPreset("6h").from);
  const [to, setTo] = useState(() => rangeFromPreset("6h").to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { from: nextFrom, to: nextTo } = rangeFromPreset(preset);
    setFrom(nextFrom);
    setTo(nextTo);
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const range = await fetchReadingsRange(
          nextFrom,
          nextTo,
          DEVICE_NAME,
          HISTORY_FETCH_LIMIT,
        );
        if (!cancelled) {
          setReadings(range.readings);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load range");
          setReadings([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [preset]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const values = extractMetricValues(readings, metricKey);
  const stats = computeStats(values);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metric-detail-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="metric-detail-title">{metric.label}</h2>
            <p className="subtitle">
              Detail · {preset} · {readings.length} points
            </p>
          </div>
          <div className="modal-actions">
            <ExportButton
              readings={readings}
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
          <RangePicker value={preset} onChange={setPreset} />
        </div>

        {error && <div className="error-banner">{error}</div>}
        {loading && <p className="view-status">Loading…</p>}

        {!loading && (
          <>
            <TimeSeriesChart
              readings={readings}
              metricKey={metricKey}
              colour={metric.colour}
              height={320}
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
                    : "—"}
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
      <span className="stat-value">{value}</span>
    </div>
  );
}
