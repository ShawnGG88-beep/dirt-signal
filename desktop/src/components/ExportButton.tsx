import type { SensorReading } from "../lib/api";
import { exportReadingsCsv } from "../lib/csv";

interface ExportButtonProps {
  readings: SensorReading[];
  from: Date;
  to: Date;
  disabled?: boolean;
  prefix?: string;
}

export function ExportButton({
  readings,
  from,
  to,
  disabled = false,
  prefix = "dirt-signal",
}: ExportButtonProps) {
  const canExport = !disabled && readings.length > 0;

  return (
    <button
      type="button"
      className="export-btn"
      disabled={!canExport}
      onClick={() => exportReadingsCsv(readings, from, to, prefix)}
      title={
        canExport
          ? `Export ${readings.length} readings as CSV`
          : "No readings to export"
      }
    >
      Export CSV
    </button>
  );
}
