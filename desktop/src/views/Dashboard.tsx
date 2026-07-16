import { useCallback, useEffect, useState } from "react";
import {
  fetchHealth,
  fetchLatestReading,
  fetchReadingsRange,
  type SensorReading,
} from "../lib/api";
import { PlantProfileSection } from "../components/PlantProfileSection";
import { MetricDetailModal } from "../components/MetricDetailModal";
import { Sparkline } from "../components/Sparkline";
import { StatusIndicator } from "../components/StatusIndicator";
import {
  DEFAULT_CROP_TYPE,
  DEFAULT_LIFECYCLE_STAGE,
  getScoringSemantic,
} from "../lib/growingConstants";
import {
  getAmbientBoundsForProfile,
  getMetricBoundsForProfile,
  scoreMetricValue,
  type MetricKey,
  type MetricStatus,
} from "../lib/metrics";

const DEVICE_NAME = "pi-garden-01";
const POLL_MS = 30_000;

function formatValue(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined) return "n/a";
  return `${value}${suffix}`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusForMetric(
  key: MetricKey,
  value: number | null | undefined,
  cropType: string,
  lifecycleStage: string,
  recordedAt?: string | null,
): MetricStatus {
  if (value === null || value === undefined) return "unknown";
  if (key === "moisture_raw") {
    return "ok";
  }
  if (key === "ambient_temp_c") {
    const at = recordedAt ?? new Date().toISOString();
    const bounds = getAmbientBoundsForProfile(at, cropType, lifecycleStage);
    const semantic = getScoringSemantic(cropType, lifecycleStage);
    return scoreMetricValue(value, bounds, semantic);
  }
  const bounds = getMetricBoundsForProfile(key, cropType, lifecycleStage);
  const semantic = getScoringSemantic(cropType, lifecycleStage);
  return scoreMetricValue(value, bounds, semantic);
}

interface MetricCardProps {
  label: string;
  value: string;
  status: MetricStatus;
  sparkValues: number[];
  sparkColour?: string;
  onOpen: () => void;
}

function MetricCard({
  label,
  value,
  status,
  sparkValues,
  sparkColour,
  onOpen,
}: MetricCardProps) {
  return (
    <button type="button" className="metric-card" onClick={onOpen}>
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <StatusIndicator label="" status={status} />
      </div>
      <div className="metric-value">{value}</div>
      <Sparkline values={sparkValues} colour={sparkColour} />
    </button>
  );
}

interface DashboardProps {
  profileEpoch: number;
  onProfileChanged: () => void;
}

export function Dashboard({ profileEpoch, onProfileChanged }: DashboardProps) {
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [cropType, setCropType] = useState<string>(DEFAULT_CROP_TYPE);
  const [lifecycleStage, setLifecycleStage] = useState<string>(
    DEFAULT_LIFECYCLE_STAGE,
  );
  const [sidecarOk, setSidecarOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [detailMetric, setDetailMetric] = useState<MetricKey | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [health, latest, range] = await Promise.all([
        fetchHealth(),
        fetchLatestReading(DEVICE_NAME),
        fetchReadingsRange(
          new Date(Date.now() - 6 * 60 * 60 * 1000),
          new Date(),
          DEVICE_NAME,
        ),
      ]);
      setSidecarOk(health.status === "ok");
      setReading(latest.reading);
      setHistory(range.readings);
      setDeviceId(latest.device_id ?? latest.reading?.device_id ?? null);
      setCropType(latest.crop_type ?? DEFAULT_CROP_TYPE);
      setLifecycleStage(latest.lifecycle_stage ?? DEFAULT_LIFECYCLE_STAGE);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setSidecarOk(false);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, profileEpoch]);

  const moistureHistory = history
    .map((r) => r.moisture_pct)
    .filter((v): v is number => v !== null);
  const phHistory = history.map((r) => r.ph).filter((v): v is number => v !== null);
  const soilTempHistory = history
    .map((r) => r.soil_temp_c)
    .filter((v): v is number => v !== null);
  const ambientTempHistory = history
    .map((r) => r.ambient_temp_c)
    .filter((v): v is number => v !== null);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Dirt Signal</h1>
          <p className="subtitle">
            {DEVICE_NAME}
            {reading && ` · last reading ${formatTimestamp(reading.recorded_at)}`}
            {` · ${cropType}/${lifecycleStage}`}
          </p>
        </div>
        <div className="status-row">
          <StatusIndicator
            label="Sidecar"
            status={sidecarOk === null ? "unknown" : sidecarOk ? "ok" : "error"}
            detail={sidecarOk ? "8731" : "offline"}
          />
          <StatusIndicator
            label="Collector"
            status={reading ? "ok" : "unknown"}
            detail={reading ? "receiving" : "no data"}
          />
          {lastRefresh && (
            <span className="refresh-time">
              refreshed {formatTimestamp(lastRefresh.toISOString())}
            </span>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="metrics-grid">
        <MetricCard
          label="Moisture"
          value={formatValue(reading?.moisture_pct, "%")}
          status={statusForMetric(
            "moisture_pct",
            reading?.moisture_pct,
            cropType,
            lifecycleStage,
          )}
          sparkValues={moistureHistory}
          onOpen={() => setDetailMetric("moisture_pct")}
        />
        <MetricCard
          label="pH"
          value={formatValue(reading?.ph)}
          status={statusForMetric("ph", reading?.ph, cropType, lifecycleStage)}
          sparkValues={phHistory}
          sparkColour="#107EEC"
          onOpen={() => setDetailMetric("ph")}
        />
        <MetricCard
          label="Soil temp"
          value={formatValue(reading?.soil_temp_c, " °C")}
          status={statusForMetric(
            "soil_temp_c",
            reading?.soil_temp_c,
            cropType,
            lifecycleStage,
          )}
          sparkValues={soilTempHistory}
          sparkColour="#FF8A00"
          onOpen={() => setDetailMetric("soil_temp_c")}
        />
        <MetricCard
          label="Ambient temp"
          value={formatValue(reading?.ambient_temp_c, " °C")}
          status={statusForMetric(
            "ambient_temp_c",
            reading?.ambient_temp_c,
            cropType,
            lifecycleStage,
            reading?.recorded_at,
          )}
          sparkValues={ambientTempHistory}
          sparkColour="#107EEC"
          onOpen={() => setDetailMetric("ambient_temp_c")}
        />
        <MetricCard
          label="Humidity"
          value={formatValue(reading?.ambient_humidity_pct, "%")}
          status={statusForMetric(
            "ambient_humidity_pct",
            reading?.ambient_humidity_pct,
            cropType,
            lifecycleStage,
          )}
          sparkValues={history
            .map((r) => r.ambient_humidity_pct)
            .filter((v): v is number => v !== null)}
          onOpen={() => setDetailMetric("ambient_humidity_pct")}
        />
        <MetricCard
          label="Raw ADC"
          value={formatValue(reading?.moisture_raw)}
          status={statusForMetric(
            "moisture_raw",
            reading?.moisture_raw,
            cropType,
            lifecycleStage,
          )}
          sparkValues={history
            .map((r) => r.moisture_raw)
            .filter((v): v is number => v !== null)}
          onOpen={() => setDetailMetric("moisture_raw")}
        />
      </section>

      <PlantProfileSection
        deviceId={deviceId}
        cropType={cropType}
        lifecycleStage={lifecycleStage}
        onProfileSaved={(nextCrop, nextStage) => {
          setCropType(nextCrop);
          setLifecycleStage(nextStage);
          onProfileChanged();
          void refresh();
        }}
      />

      <footer className="dashboard-footer">
        <span>6h sparklines · polls every 30s · click a card for detail</span>
        <button type="button" className="refresh-btn" onClick={() => void refresh()}>
          Refresh now
        </button>
      </footer>

      {detailMetric && (
        <MetricDetailModal
          metricKey={detailMetric}
          deviceCropType={cropType}
          deviceLifecycleStage={lifecycleStage}
          onClose={() => setDetailMetric(null)}
        />
      )}
    </div>
  );
}
