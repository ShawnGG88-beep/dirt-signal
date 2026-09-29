import { describe, expect, it } from "vitest";
import {
  formatDeviceClock,
  formatDeviceDateTime,
  formatRelativeAge,
  formatUpdatedAgo,
} from "./formatTime";

describe("formatTime", () => {
  it("formats absolute times in the device timezone, not UTC wall clock", () => {
    // 12:00 UTC on a winter day → 14:00 in Africa/Johannesburg (UTC+2)
    const iso = "2026-06-15T12:00:00.000Z";
    expect(
      formatDeviceClock(iso, { timeZone: "Africa/Johannesburg" }),
    ).toMatch(/14:00/);
    expect(
      formatDeviceDateTime(iso, { timeZone: "Africa/Johannesburg" }),
    ).toContain("15 Jun 2026");
  });

  it("formats relative ages", () => {
    const now = 1_000_000;
    expect(formatRelativeAge(now - 5_000, now)).toBe("5s");
    expect(formatRelativeAge(now - 120_000, now)).toBe("2m");
    expect(formatUpdatedAgo(new Date(now - 120_000).toISOString(), now)).toBe(
      "Updated 2 min ago",
    );
  });
});
