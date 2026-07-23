import type { PlantEvent, SensorReading } from "./api";
import { eventTypeLabel } from "./eventTypes";
import { METRICS } from "./metrics";

const CSV_COLUMNS = ["recorded_at", ...METRICS.map((m) => m.key)] as const;

const EVENT_CSV_COLUMNS = [
  "occurred_at",
  "event_type",
  "quantity",
  "quantity_unit",
  "note",
  "source",
  "crop_type_at_event",
  "lifecycle_stage_at_event",
] as const;

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

export function eventsToCsv(events: PlantEvent[]): string {
  const header = EVENT_CSV_COLUMNS.join(",");
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
  const rows = sorted.map((event) =>
    EVENT_CSV_COLUMNS.map((col) => {
      if (col === "event_type") {
        return escapeCell(
          `${event.event_type} (${eventTypeLabel(event.event_type)})`,
        );
      }
      return escapeCell(event[col]);
    }).join(","),
  );
  return [header, ...rows].join("\n");
}

/** Readings section plus a clearly delimited events section. */
export function readingsAndEventsToCsv(
  readings: SensorReading[],
  events: PlantEvent[],
): string {
  const readingsBlock = readingsToCsv(readings);
  if (events.length === 0) return readingsBlock;
  const eventsBlock = eventsToCsv(events);
  return [
    readingsBlock,
    "",
    "# --- plant_events ---",
    eventsBlock,
  ].join("\n");
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
  events: PlantEvent[] = [],
): void {
  const fromTag = from.toISOString().slice(0, 10);
  const toTag = to.toISOString().slice(0, 10);
  const filename = `${prefix}_${fromTag}_to_${toTag}.csv`;
  const csv =
    events.length > 0
      ? readingsAndEventsToCsv(readings, events)
      : readingsToCsv(readings);
  downloadCsv(filename, csv);
}
