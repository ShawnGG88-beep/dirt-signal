import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  dewPointC,
  gddDay,
  MIN_R_SQUARED,
  projectDrydown,
  vapourPressureDeficitKpa,
} from "./derived";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const VPD_FIXTURE = join(ROOT, "shared/fixtures/derived_vpd.json");
const DRYDOWN_FIXTURE = join(ROOT, "shared/fixtures/drydown_cases.json");

interface VpdCase {
  id: string;
  ambient_temp_c: number | null;
  ambient_humidity_pct: number | null;
  expect_vpd_kpa: number | null;
  expect_dew_point_c: number | null;
}

interface DrydownCase {
  id: string;
  now: string;
  moisture_lower_bound: number;
  events: { event_type: string; occurred_at: string }[];
  readings: { recorded_at: string; moisture_pct: number }[];
  expect_suppressed_reason: string;
  expect_hours_to_bound: number | null;
}

describe("derived metrics fixtures", () => {
  it("MIN_R_SQUARED is provisional 0.7", () => {
    expect(MIN_R_SQUARED).toBe(0.7);
  });

  it("vapourPressureDeficitKpa and dewPointC match derived_vpd.json", () => {
    const cases = JSON.parse(readFileSync(VPD_FIXTURE, "utf-8")) as VpdCase[];
    for (const c of cases) {
      const vpd = vapourPressureDeficitKpa(
        c.ambient_temp_c,
        c.ambient_humidity_pct,
      );
      const dew = dewPointC(c.ambient_temp_c, c.ambient_humidity_pct);
      if (c.expect_vpd_kpa == null) {
        expect(vpd, c.id).toBeNull();
      } else {
        expect(vpd, c.id).not.toBeNull();
        expect(Math.abs(vpd! - c.expect_vpd_kpa), c.id).toBeLessThan(1e-4);
      }
      if (c.expect_dew_point_c == null) {
        expect(dew, c.id).toBeNull();
      } else {
        expect(dew, c.id).not.toBeNull();
        expect(Math.abs(dew! - c.expect_dew_point_c), c.id).toBeLessThan(1e-3);
      }
    }
  });

  it("gddDay triangle", () => {
    expect(gddDay(30, 10, 10)).toBe(10);
    expect(gddDay(8, 5, 10)).toBe(0);
    expect(gddDay(null, 10)).toBeNull();
  });

  it("projectDrydown matches drydown_cases.json", () => {
    const cases = JSON.parse(
      readFileSync(DRYDOWN_FIXTURE, "utf-8"),
    ) as DrydownCase[];
    for (const c of cases) {
      const result = projectDrydown(c.readings, c.events, {
        moistureLowerBound: c.moisture_lower_bound,
        now: c.now,
      });
      expect(result.suppressed_reason, c.id).toBe(c.expect_suppressed_reason);
      if (c.expect_hours_to_bound == null) {
        expect(result.projection, c.id).toBeNull();
      } else {
        expect(result.projection, c.id).not.toBeNull();
        expect(
          Math.abs(
            result.projection!.hours_to_lower_bound - c.expect_hours_to_bound,
          ),
          c.id,
        ).toBeLessThan(0.05);
      }
    }
  });
});
