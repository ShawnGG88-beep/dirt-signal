import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isDayPeriod,
  localDayKey,
  localHour,
} from "./dayNight";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = join(ROOT, "shared/fixtures/day_night_boundary.json");

interface DayNightCase {
  id: string;
  recorded_at: string;
  timezone: string;
  expect_day: boolean;
  expect_local_hour: number;
  expect_day_key: string;
}

function loadCases(): DayNightCase[] {
  return JSON.parse(readFileSync(FIXTURE, "utf-8")) as DayNightCase[];
}

describe("dayNight boundary fixture", () => {
  it("matches shared/fixtures/day_night_boundary.json", () => {
    for (const c of loadCases()) {
      expect(localHour(c.recorded_at, c.timezone), c.id).toBe(
        c.expect_local_hour,
      );
      expect(isDayPeriod(c.recorded_at, c.timezone), c.id).toBe(c.expect_day);
      expect(localDayKey(c.recorded_at, c.timezone), c.id).toBe(
        c.expect_day_key,
      );
    }
  });

  it("05:00 UTC with Africa/Johannesburg is day band (07:00 local)", () => {
    expect(isDayPeriod("2026-07-23T05:00:00Z", "Africa/Johannesburg")).toBe(
      true,
    );
    expect(localHour("2026-07-23T05:00:00Z", "Africa/Johannesburg")).toBe(7);
  });
});
