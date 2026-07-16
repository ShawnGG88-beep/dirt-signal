import { useEffect, useMemo, useState } from "react";
import {
  fetchReadingsRange,
  HISTORY_FETCH_LIMIT,
  type SensorReading,
} from "../lib/api";
import { buildDailySummaries } from "../lib/dailySummary";
import {
  formatMetricValue,
  rangeFromPreset,
  type RangePreset,
} from "../lib/metrics";
import { ExportButton } from "../components/ExportButton";
import { RangePicker } from "../components/RangePicker";

const DEVICE_NAME = "pi-garden-01";

function formatDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRange(
  min: number | null,
  max: number | null,
  unit: string,
): string {
  if (min === null || max === null) return "—";
  const lo = formatMetricValue(min, "", 2);
  const hi = formatMetricValue(max, "", 2);
  const suffix = unit ? ` ${unit}` : "";
  return `${lo} to ${hi}${suffix}`;
}

export function Reports() {
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [from, setFrom] = useState(() => rangeFromPreset("30d").from);
  const [to, setTo] = useState(() => rangeFromPreset("30d").to);
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
          setError(err instanceof Error ? err.message : "Failed to load report");
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

  const summaries = useMemo(() => buildDailySummaries(readings), [readings]);

  return (
    <div className="view-page">
      <header className="view-header">
        <div>
          <h1>Reports</h1>
          <p className="subtitle">
            Daily digest · average and range per metric · flags outside tomato
            reference bounds
          </p>
        </div>
        <div className="view-toolbar">
          <RangePicker value={preset} onChange={setPreset} />
          <ExportButton
            readings={readings}
            from={from}
            to={to}
            prefix="dirt-signal-report"
          />
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="view-status">Loading…</p>}

      {!loading && summaries.length === 0 && (
        <p className="view-status">No readings in this range</p>
      )}

      {!loading && summaries.length > 0 && (
        <div className="reports-list">
          {summaries.map((summary) => (
            <section key={summary.day} className="report-day">
              <div className="report-day-header">
                <h2>{formatDayLabel(summary.day)}</h2>
                {summary.hasFlags ? (
                  <span className="flag-badge">out of bounds</span>
                ) : (
                  <span className="ok-badge">within bounds</span>
                )}
              </div>
              <div className="table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Mean</th>
                      <th>Range</th>
                      <th>n</th>
                      <th>Reference</th>
                      <th>Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.metrics.map((m) => (
                      <tr
                        key={m.key}
                        className={m.outOfBounds ? "row-flagged" : undefined}
                      >
                        <td>{m.label}</td>
                        <td>{formatMetricValue(m.mean, m.unit, 2)}</td>
                        <td>{formatRange(m.min, m.max, m.unit)}</td>
                        <td>{m.count}</td>
                        <td className="ref-cell">{m.referenceLabel}</td>
                        <td>
                          {!m.flaggable ? (
                            <span className="muted-cell">—</span>
                          ) : m.outOfBounds ? (
                            <span className="flag-dot" title="Outside bounds">
                              !
                            </span>
                          ) : (
                            <span className="muted-cell">ok</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <footer className="reports-footer">
        <p>
          Bounds from <code>ml-backend/constants.py</code> (mirrored in{" "}
          <code>src/lib/growingConstants.ts</code>). Ambient uses day
          (06:00–18:00) and night ranges separately. N/P/K estimates are shown
          without pass/fail until calibrated against soil-test ground truth.
        </p>
      </footer>
    </div>
  );
}
