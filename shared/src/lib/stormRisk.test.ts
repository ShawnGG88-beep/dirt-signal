import { describe, expect, it } from "vitest";
import {
  evaluateStormRisk,
  hourTriggersStormRisk,
  isThunderstormCode,
  STORM_GUST_THRESHOLD_KMH,
} from "./stormRisk";

describe("stormRisk", () => {
  it("recognises thunderstorm WMO codes 95, 96, 99 only", () => {
    expect(isThunderstormCode(95)).toBe(true);
    expect(isThunderstormCode(96)).toBe(true);
    expect(isThunderstormCode(99)).toBe(true);
    expect(isThunderstormCode(61)).toBe(false);
    expect(isThunderstormCode(0)).toBe(false);
    expect(isThunderstormCode(null)).toBe(false);
  });

  it("triggers on thunderstorm code without needing gusts", () => {
    const hit = hourTriggersStormRisk({
      forecast_time: "2026-09-28T12:00:00.000Z",
      weather_code: 95,
      wind_gusts_10m: 10,
    });
    expect(hit?.reason).toBe("thunderstorm_code");
  });

  it("triggers on gust threshold without thunderstorm code", () => {
    const hit = hourTriggersStormRisk({
      forecast_time: "2026-09-28T12:00:00.000Z",
      weather_code: 3,
      wind_gusts_10m: STORM_GUST_THRESHOLD_KMH,
    });
    expect(hit?.reason).toBe("gust_threshold");
  });

  it("does not trigger on CAPE alone (cape is not an input)", () => {
    const hit = hourTriggersStormRisk({
      forecast_time: "2026-09-28T12:00:00.000Z",
      weather_code: 1,
      wind_gusts_10m: 20,
    });
    expect(hit).toBeNull();
  });

  it("evaluates a window and stays provisional", () => {
    const result = evaluateStormRisk(
      [
        {
          forecast_time: "2026-09-28T10:00:00.000Z",
          weather_code: 1,
          wind_gusts_10m: 12,
        },
        {
          forecast_time: "2026-09-28T14:00:00.000Z",
          weather_code: 99,
          wind_gusts_10m: 40,
        },
      ],
      {
        fromAt: "2026-09-28T00:00:00.000Z",
        toAt: "2026-09-29T00:00:00.000Z",
      },
    );
    expect(result.active).toBe(true);
    expect(result.provisional).toBe(true);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].reason).toBe("thunderstorm_code");
  });

  it("ignores hours outside the window", () => {
    const result = evaluateStormRisk(
      [
        {
          forecast_time: "2026-09-30T14:00:00.000Z",
          weather_code: 95,
          wind_gusts_10m: 80,
        },
      ],
      {
        fromAt: "2026-09-28T00:00:00.000Z",
        toAt: "2026-09-29T00:00:00.000Z",
      },
    );
    expect(result.active).toBe(false);
    expect(result.hits).toHaveLength(0);
  });
});
