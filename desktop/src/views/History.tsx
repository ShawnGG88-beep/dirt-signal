import { useCallback, useEffect, useState } from "react";
import {
  fetchEvents,
  fetchReadingsRange,
  HISTORY_FETCH_LIMIT,
  type PlantEvent,
  type SensorReading,
} from "../lib/api";
import {
  DEFAULT_CROP_TYPE,
  DEFAULT_LIFECYCLE_STAGE,
} from "../lib/growingConstants";
import {
  loadEventFilter,
  saveEventFilter,
  type PlantEventTypeKey,
} from "../lib/eventTypes";
import {
  METRICS,
  rangeFromPreset,
  type RangePreset,
} from "../lib/metrics";
import { EventTypeFilter } from "../components/EventMarkerRail";
import { ExportButton } from "../components/ExportButton";
import { RangePicker } from "../components/RangePicker";
import { TimeSeriesChart } from "../components/TimeSeriesChart";

const DEVICE_NAME = "pi-garden-01";
const FILTER_VIEW = "history";

interface HistoryProps {
  profileEpoch: number;
  eventsEpoch?: number;
  range: RangePreset;
  onRangeChange: (range: RangePreset) => void;
  onEventsChanged?: () => void;
}

export function History({
  profileEpoch,
  eventsEpoch = 0,
  range: preset,
  onRangeChange,
  onEventsChanged,
}: HistoryProps) {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [events, setEvents] = useState<PlantEvent[]>([]);
  const [cropType, setCropType] = useState<string>(DEFAULT_CROP_TYPE);
  const [lifecycleStage, setLifecycleStage] = useState<string>(
    DEFAULT_LIFECYCLE_STAGE,
  );
  const [from, setFrom] = useState(() => rangeFromPreset(preset).from);
  const [to, setTo] = useState(() => rangeFromPreset(preset).to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<PlantEventTypeKey>>(
    () => loadEventFilter(FILTER_VIEW),
  );

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
  }, [preset, profileEpoch, eventsEpoch]);

  function onFilterChange(next: Set<PlantEventTypeKey>) {
    setEnabledTypes(next);
    saveEventFilter(FILTER_VIEW, next);
  }

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
            {events.length} events · {cropType}/{lifecycleStage}
          </p>
        </div>
        <div className="view-toolbar">
          <RangePicker value={preset} onChange={onRangeChange} />
          <ExportButton
            readings={readings}
            events={events}
            from={from}
            to={to}
          />
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
        <>
          <EventTypeFilter enabled={enabledTypes} onChange={onFilterChange} />
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
                  events={events}
                  fromAt={from}
                  toAt={to}
                  enabledEventTypes={enabledTypes}
                  onEventsChanged={() => {
                    void refreshEvents(from, to);
                    onEventsChanged?.();
                  }}
                />
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
