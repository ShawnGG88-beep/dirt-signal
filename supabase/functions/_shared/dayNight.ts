/**
 * Device-local day/night and calendar-day helpers.
 *
 * Day is [DAY_START_HOUR, DAY_END_HOUR) in the *device* IANA timezone — never
 * UTC wall-clock and never the browser local zone. Backend mirrors this in
 * day_night.py; cross-boundary tests assert identical verdicts.
 */

/** Inclusive start, exclusive end — matches docs/dashboard.md. */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 18;

export const DEFAULT_DEVICE_TIMEZONE = "Africa/Johannesburg";

function toDate(recordedAt: string | Date): Date {
  return typeof recordedAt === "string" ? new Date(recordedAt) : recordedAt;
}

/**
 * Hour 0–23 in the device timezone via Intl (not Date#getHours).
 */
export function localHour(
  recordedAt: string | Date,
  timeZone: string,
): number {
  const d = toDate(recordedAt);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || DEFAULT_DEVICE_TIMEZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(d);
  const hourPart = parts.find((p) => p.type === "hour");
  const hour = hourPart ? Number.parseInt(hourPart.value, 10) : Number.NaN;
  if (Number.isNaN(hour)) {
    throw new Error(`Failed to resolve local hour for timezone ${timeZone}`);
  }
  // Some engines still emit "24" for midnight under h23; normalise.
  return hour === 24 ? 0 : hour;
}

/** YYYY-MM-DD in the device timezone. */
export function localDayKey(
  recordedAt: string | Date,
  timeZone: string,
): string {
  const d = toDate(recordedAt);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || DEFAULT_DEVICE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Failed to resolve local day for timezone ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

/** True when device-local hour is in [DAY_START_HOUR, DAY_END_HOUR). */
export function isDayPeriod(
  recordedAt: string | Date,
  timeZone: string,
): boolean {
  const hour = localHour(recordedAt, timeZone);
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR;
}

/** Complement of isDayPeriod (device-local). */
export function isNightPeriod(
  recordedAt: string | Date,
  timeZone: string,
): boolean {
  return !isDayPeriod(recordedAt, timeZone);
}
