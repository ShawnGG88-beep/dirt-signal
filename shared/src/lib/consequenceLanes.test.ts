import { describe, expect, it } from "vitest";
import {
  buildConsequenceLanes,
  laneSegmentFrac,
} from "./consequenceLanes";
import type {
  DailyAdvisoryDigestPayload,
  WeatherForecastHour,
} from "../data/types";

function hour(
  iso: string,
  partial: Partial<WeatherForecastHour> = {},
): WeatherForecastHour {
  return {
    forecast_time: iso,
    fetched_at: iso,
    temperature_2m: 18,
    relative_humidity_2m: 50,
    precipitation: 0,
    precipitation_probability: 10,
    wind_speed_10m: 8,
    wind_gusts_10m: 12,
    cloud_cover: 20,
    weather_code: 1,
    cape: 0,
    et0_fao_evapotranspiration: 0.1,
    soil_temperature_0cm: null,
    soil_moisture_0_1cm: null,
    source: "open-meteo",
    ...partial,
  };
}

const digestBase: DailyAdvisoryDigestPayload = {
  device_id: "dev",
  crop_type: "grape_wine",
  lifecycle_stage: "establishment",
  evaluated_at: "2026-09-28T12:00:00.000Z",
  spray_window: {
    found: false,
    window_start: null,
    window_end: null,
    message: "No suitable spray window in the next 48 hours.",
  },
  capture_suggestion: {
    suggested_at: null,
    cloud_cover: null,
    stability_label: "unknown",
    note: "",
  },
  tomato: null,
};

describe("consequenceLanes", () => {
  it("emits spray as a solid hourly window clipped to the band", () => {
    const hours = [
      hour("2026-09-28T06:00:00.000Z"),
      hour("2026-09-28T07:00:00.000Z"),
      hour("2026-09-28T08:00:00.000Z"),
      hour("2026-09-28T09:00:00.000Z"),
    ];
    const digest: DailyAdvisoryDigestPayload = {
      ...digestBase,
      spray_window: {
        found: true,
        window_start: "2026-09-28T05:00:00.000Z",
        window_end: "2026-09-28T08:30:00.000Z",
        message: "Spray window morning.",
      },
    };
    const result = buildConsequenceLanes({
      digest,
      hours,
      timeZone: "Africa/Johannesburg",
    });
    const spray = result.lanes.find((l) => l.kind === "spray");
    expect(spray?.pattern).toBe("solid");
    expect(spray?.shadowMode).toBe(true);
    expect(spray?.actionable).toBe(true);
    expect(spray?.segments[0]?.start).toBe("2026-09-28T06:00:00.000Z");
    expect(spray?.segments[0]?.end).toBe("2026-09-28T08:30:00.000Z");
  });

  it("emits frost as day-level hatch tags from tomato chill digest", () => {
    const hours = [
      hour("2026-09-28T18:00:00.000Z"),
      hour("2026-09-29T02:00:00.000Z"),
      hour("2026-09-29T10:00:00.000Z"),
    ];
    const digest: DailyAdvisoryDigestPayload = {
      ...digestBase,
      crop_type: "tomato",
      tomato: {
        chill: {
          nights: [
            { date: "2026-09-29", low_c: -1.2, tier: "frost" },
            { date: "2026-09-30", low_c: 2, tier: "chilling" },
          ],
          highest_tier: "frost",
          message: "Forecast nights at risk.",
        },
      },
    };
    const result = buildConsequenceLanes({
      digest,
      hours,
      timeZone: "Africa/Johannesburg",
    });
    const frost = result.lanes.find((l) => l.kind === "frost");
    expect(frost?.pattern).toBe("hatch");
    expect(frost?.granularity).toBe("daily");
    expect(frost?.segments.length).toBe(1);
    expect(frost?.provisional).toBe(true);
  });

  it("emits water use sparkline without calling it irrigation", () => {
    const hours = [
      hour("2026-09-28T10:00:00.000Z", { et0_fao_evapotranspiration: 0.2 }),
      hour("2026-09-28T11:00:00.000Z", { et0_fao_evapotranspiration: 0.3 }),
    ];
    const result = buildConsequenceLanes({
      digest: digestBase,
      hours,
      timeZone: "Africa/Johannesburg",
    });
    const water = result.lanes.find((l) => l.kind === "water_use");
    expect(water?.pattern).toBe("sparkline");
    expect(water?.title).toBe("Water use (ET0)");
    expect(water?.summary.toLowerCase()).not.toContain("irrigat");
    expect(water?.actionable).toBe(false);
    expect(water?.sparkline).toEqual([0.2, 0.3]);
  });

  it("emits storm outline from gusts and marks provisional", () => {
    const hours = [
      hour("2026-09-28T12:00:00.000Z", { wind_gusts_10m: 65, weather_code: 3 }),
      hour("2026-09-28T13:00:00.000Z", { wind_gusts_10m: 70, weather_code: 3 }),
    ];
    const result = buildConsequenceLanes({
      digest: digestBase,
      hours,
      timeZone: "Africa/Johannesburg",
    });
    const storm = result.lanes.find((l) => l.kind === "storm");
    expect(storm?.pattern).toBe("outline");
    expect(storm?.provisional).toBe(true);
    expect(result.storm.active).toBe(true);
    expect(result.nothingToActOn).toBe(false);
  });

  it("sets nothingToActOn when only water use is present", () => {
    const hours = [
      hour("2026-09-28T10:00:00.000Z", { et0_fao_evapotranspiration: 0.15 }),
    ];
    const result = buildConsequenceLanes({
      digest: digestBase,
      hours,
      timeZone: "Africa/Johannesburg",
    });
    expect(result.lanes.some((l) => l.kind === "water_use")).toBe(true);
    expect(result.nothingToActOn).toBe(true);
  });

  it("omits grape disease placeholders", () => {
    const hours = [hour("2026-09-28T10:00:00.000Z")];
    const result = buildConsequenceLanes({
      digest: digestBase,
      hours,
      timeZone: "Africa/Johannesburg",
    });
    expect(result.lanes.some((l) => /mildew|botrytis|disease/i.test(l.kind))).toBe(
      false,
    );
  });

  it("maps segment fracs across the band", () => {
    const hours = [
      hour("2026-09-28T00:00:00.000Z"),
      hour("2026-09-28T12:00:00.000Z"),
    ];
    expect(laneSegmentFrac("2026-09-28T00:00:00.000Z", hours)).toBe(0);
    expect(laneSegmentFrac("2026-09-28T12:00:00.000Z", hours)).toBe(1);
    expect(laneSegmentFrac("2026-09-28T06:00:00.000Z", hours)).toBeCloseTo(0.5);
  });
});
