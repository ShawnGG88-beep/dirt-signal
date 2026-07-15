import { useCallback, useEffect, useState } from "react";
import {
  fetchHealth,
  fetchLatestReading,
  fetchReadingsRange,
  type SensorReading,
} from "../lib/api";
import { Sparkline } from "../components/Sparkline";
import { StatusIndicator } from "../components/StatusIndicator";

const DEVICE_NAME = "pi-garden-01";
const POLL_MS = 30_000;

function formatValue(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined) return "—";
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

function moistureStatus(pct: number | null | undefined): "ok" | "warn" | "error" | "unknown" {
  if (pct === null || pct === undefined) return "unknown";
  if (pct < 20) return "warn";
  if (pct > 80) return "warn";
  return "ok";
}

function phStatus(ph: number | null | undefined): "ok" | "warn" | "error" | "unknown" {
  if (ph === null || ph === undefined) return "unknown";
  if (ph < 5.5 || ph > 8.0) return "warn";
  return "ok";
}

interface MetricCardProps {
  label: string;
  value: string;
  status: "ok" | "warn" | "error" | "unknown";
  sparkValues: number[];
  sparkColour?: string;
}

function MetricCard({ label, value, status, sparkValues, sparkColour }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <StatusIndicator label="" status={status} />
      </div>
      <div className="metric-value">{value}</div>
      <Sparkline values={sparkValues} colour={sparkColour} />
    </div>
  );
}

export function Dashboard() {
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [sidecarOk, setSidecarOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

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
  }, [refresh]);

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
          status={moistureStatus(reading?.moisture_pct)}
          sparkValues={moistureHistory}
        />
        <MetricCard
          label="pH"
          value={formatValue(reading?.ph)}
          status={phStatus(reading?.ph)}
          sparkValues={phHistory}
          sparkColour="#107EEC"
        />
        <MetricCard
          label="Soil temp"
          value={formatValue(reading?.soil_temp_c, " °C")}
          status={reading?.soil_temp_c != null ? "ok" : "unknown"}
          sparkValues={soilTempHistory}
          sparkColour="#FF8A00"
        />
        <MetricCard
          label="Ambient temp"
          value={formatValue(reading?.ambient_temp_c, " °C")}
          status={reading?.ambient_temp_c != null ? "ok" : "unknown"}
          sparkValues={ambientTempHistory}
          sparkColour="#107EEC"
        />
        <MetricCard
          label="Humidity"
          value={formatValue(reading?.ambient_humidity_pct, "%")}
          status={reading?.ambient_humidity_pct != null ? "ok" : "unknown"}
          sparkValues={history
            .map((r) => r.ambient_humidity_pct)
            .filter((v): v is number => v !== null)}
        />
        <MetricCard
          label="Raw ADC"
          value={formatValue(reading?.moisture_raw)}
          status={reading?.moisture_raw != null ? "ok" : "unknown"}
          sparkValues={history
            .map((r) => r.moisture_raw)
            .filter((v): v is number => v !== null)}
        />
      </section>

      <footer className="dashboard-footer">
        <span>6h sparklines · polls every 30s</span>
        <button type="button" className="refresh-btn" onClick={() => void refresh()}>
          Refresh now
        </button>
      </footer>
    </div>
  );
}
