import { useEffect, useState } from "react";
import {
  fetchReadingsRange,
  HISTORY_FETCH_LIMIT,
  type SensorReading,
} from "../lib/api";
import {
  DEFAULT_CROP_TYPE,
  DEFAULT_LIFECYCLE_STAGE,
} from "../lib/growingConstants";
import {
  METRICS,
  rangeFromPreset,
  type RangePreset,
} from "../lib/metrics";
import { ExportButton } from "../components/ExportButton";
import { RangePicker } from "../components/RangePicker";
import { TimeSeriesChart } from "../components/TimeSeriesChart";

const DEVICE_NAME = "pi-garden-01";

interface HistoryProps {
  profileEpoch: number;
}

export function History({ profileEpoch }: HistoryProps) {
  const [preset, setPreset] = useState<RangePreset>("24h");
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [cropType, setCropType] = useState<string>(DEFAULT_CROP_TYPE);
  const [lifecycleStage, setLifecycleStage] = useState<string>(
    DEFAULT_LIFECYCLE_STAGE,
  );
  const [from, setFrom] = useState(() => rangeFromPreset("24h").from);
  const [to, setTo] = useState(() => rangeFromPreset("24h").to);
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
          setCropType(range.crop_type ?? DEFAULT_CROP_TYPE);
          setLifecycleStage(
            range.lifecycle_stage ?? DEFAULT_LIFECYCLE_STAGE,
          );
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load history");
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
  }, [preset, profileEpoch]);

  const hasUnknownProvenance = readings.some(
    (r) => !r.crop_type_at_reading || !r.lifecycle_stage_at_reading,
  );

  return (
    <div className="view-page">
      <header className="view-header">
        <div>
          <h1>History</h1>
          <p className="subtitle">
            Small multiples · shared window · {readings.length} readings ·{" "}
            {cropType}/{lifecycleStage}
          </p>
        </div>
        <div className="view-toolbar">
          <RangePicker value={preset} onChange={setPreset} />
          <ExportButton readings={readings} from={from} to={to} />
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="view-status">Loading…</p>}
      {!loading && hasUnknownProvenance && (
        <p className="view-status provenance-note">
          Profile unknown for this period: some readings predate provenance
          stamping and are scored with the device&apos;s current profile.
        </p>
      )}

      {!loading && (
        <section className="history-grid">
          {METRICS.map((metric) => (
            <article key={metric.key} className="history-panel">
              <div className="history-panel-header">
                <span className="metric-label">{metric.label}</span>
                {metric.unit && (
                  <span className="history-unit">{metric.unit}</span>
                )}
              </div>
              <TimeSeriesChart
                readings={readings}
                metricKey={metric.key}
                colour={metric.colour}
                height={160}
                compact
                deviceCropType={cropType}
                deviceLifecycleStage={lifecycleStage}
                segmentByProfile
              />
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
