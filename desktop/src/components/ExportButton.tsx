import type { PlantEvent, SensorReading } from "../lib/api";
import { exportReadingsCsv } from "../lib/csv";

interface ExportButtonProps {
  readings: SensorReading[];
  from: Date;
  to: Date;
  disabled?: boolean;
  prefix?: string;
  events?: PlantEvent[];
}

export function ExportButton({
  readings,
  from,
  to,
  disabled = false,
  prefix = "dirt-signal",
  events = [],
}: ExportButtonProps) {
  const canExport = !disabled && (readings.length > 0 || events.length > 0);

  return (
    <button
      type="button"
      className="export-btn"
      disabled={!canExport}
      onClick={() => exportReadingsCsv(readings, from, to, prefix, events)}
      title={
        canExport
          ? `Export ${readings.length} readings` +
            (events.length > 0 ? ` and ${events.length} events` : "") +
            " as CSV"
          : "Nothing to export"
      }
    >
      Export CSV
    </button>
  );
}
