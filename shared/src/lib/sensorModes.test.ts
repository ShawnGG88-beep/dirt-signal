import { describe, expect, it } from "vitest";
import { metricIsSimulated } from "./sensorModes";

describe("sensorModes", () => {
  it("marks moisture simulated only when moisture_mode is mock", () => {
    expect(
      metricIsSimulated("moisture_pct", { moisture_mode: "mock" }),
    ).toBe(true);
    expect(
      metricIsSimulated("moisture_pct", { moisture_mode: "real" }),
    ).toBe(false);
    expect(metricIsSimulated("moisture_pct", {})).toBe(false);
  });

  it("treats VPD and dew point as ambient (dht22) streams", () => {
    expect(metricIsSimulated("vpd_kpa", { dht22_mode: "mock" })).toBe(true);
    expect(metricIsSimulated("dew_point_c", { dht22_mode: "real" })).toBe(
      false,
    );
  });
});
