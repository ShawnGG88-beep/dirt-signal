import type { SensorReading } from "./api";
import { METRICS } from "./metrics";

const CSV_COLUMNS = ["recorded_at", ...METRICS.map((m) => m.key)] as const;

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function readingsToCsv(readings: SensorReading[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = readings.map((reading) =>
    CSV_COLUMNS.map((col) => {
      if (col === "recorded_at") return escapeCell(reading.recorded_at);
      return escapeCell(reading[col]);
    }).join(","),
  );
  return [header, ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportReadingsCsv(
  readings: SensorReading[],
  from: Date,
  to: Date,
  prefix = "dirt-signal",
): void {
  const fromTag = from.toISOString().slice(0, 10);
  const toTag = to.toISOString().slice(0, 10);
  const filename = `${prefix}_${fromTag}_to_${toTag}.csv`;
  downloadCsv(filename, readingsToCsv(readings));
}
