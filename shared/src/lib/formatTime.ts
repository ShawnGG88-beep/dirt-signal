/**
 * Display-time formatting in the device IANA timezone.
 *
 * Use these helpers for any user-visible clock time. Do not call
 * Date#toLocaleString without an explicit timeZone. This does not change
 * day/night band scoring (see dayNight.ts).
 */

import { DEFAULT_DEVICE_TIMEZONE } from "./dayNight";

function resolveZone(timeZone?: string | null): string {
  return timeZone && timeZone.trim() ? timeZone : DEFAULT_DEVICE_TIMEZONE;
}

function toDate(value: string | Date | number): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

export interface FormatDeviceTimeOptions {
  timeZone?: string | null;
  /** en-GB by default (British English UI). */
  locale?: string;
}

/** Absolute date and time, e.g. "28 Sep 2026, 14:05". */
export function formatDeviceDateTime(
  value: string | Date | number,
  options: FormatDeviceTimeOptions = {},
): string {
  const timeZone = resolveZone(options.timeZone);
  return toDate(value).toLocaleString(options.locale ?? "en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** Clock time only, e.g. "14:05". */
export function formatDeviceClock(
  value: string | Date | number,
  options: FormatDeviceTimeOptions = {},
): string {
  const timeZone = resolveZone(options.timeZone);
  return toDate(value).toLocaleString(options.locale ?? "en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** Short calendar day, e.g. "28 Sep". */
export function formatDeviceDay(
  value: string | Date | number,
  options: FormatDeviceTimeOptions = {},
): string {
  const timeZone = resolveZone(options.timeZone);
  return toDate(value).toLocaleString(options.locale ?? "en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
  });
}

/** Relative age for freshness labels, British English. */
export function formatRelativeAge(
  thenMs: number,
  nowMs: number,
): string {
  const delta = Math.max(0, nowMs - thenMs);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}

/** Freshness phrase, e.g. "Updated 2 min ago". */
export function formatUpdatedAgo(
  value: string | Date | number | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (value == null) return "Updated unknown";
  const then = toDate(value).getTime();
  if (!Number.isFinite(then)) return "Updated unknown";
  const age = formatRelativeAge(then, nowMs);
  if (age.endsWith("s")) return `Updated ${age.replace("s", " sec")} ago`;
  if (age.endsWith("m")) return `Updated ${age.replace("m", " min")} ago`;
  if (age.endsWith("h")) return `Updated ${age.replace("h", " h")} ago`;
  return `Updated ${age.replace("d", " d")} ago`;
}
