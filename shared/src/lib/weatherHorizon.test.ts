import { describe, expect, it } from "vitest";
import {
  FORECAST_STALE_AFTER_MS,
  digestIsStale,
  forecastIsStale,
  isDaylightAt,
  skyBandGradient,
  skyPhaseAt,
  skyCssColour,
  weatherCodeLabel,
} from "./weatherHorizon";

describe("weatherHorizon helpers", () => {
  const sunrise = "2026-09-28T04:15:00.000Z";
  const sunset = "2026-09-28T16:05:00.000Z";

  it("derives is_day from sunrise and sunset", () => {
    expect(isDaylightAt("2026-09-28T10:00:00.000Z", sunrise, sunset)).toBe(
      true,
    );
    expect(isDaylightAt("2026-09-28T20:00:00.000Z", sunrise, sunset)).toBe(
      false,
    );
    expect(isDaylightAt("2026-09-28T10:00:00.000Z", null, sunset)).toBe(false);
  });

  it("distinguishes dawn, day, dusk and night", () => {
    expect(skyPhaseAt("2026-09-28T04:20:00.000Z", sunrise, sunset)).toBe(
      "dawn",
    );
    expect(skyPhaseAt("2026-09-28T10:00:00.000Z", sunrise, sunset)).toBe(
      "day",
    );
    expect(skyPhaseAt("2026-09-28T16:10:00.000Z", sunrise, sunset)).toBe(
      "dusk",
    );
    expect(skyPhaseAt("2026-09-28T20:00:00.000Z", sunrise, sunset)).toBe(
      "night",
    );
  });

  it("returns warm day token, not a blue-grey hardcode", () => {
    const day = skyCssColour({
      forecast_time: "2026-09-28T10:00:00.000Z",
      cloud_cover: 10,
      sunrise_at: sunrise,
      sunset_at: sunset,
    });
    expect(day).toContain("var(--sky-day)");
    expect(day).not.toContain("#6a7f9a");
  });

  it("keeps overcast day mostly on the warm day token", () => {
    const day = skyCssColour({
      forecast_time: "2026-09-28T10:00:00.000Z",
      cloud_cover: 100,
      sunrise_at: sunrise,
      sunset_at: sunset,
    });
    expect(day).toContain("var(--sky-day)");
    expect(day).toMatch(/78%/);
  });

  it("builds a continuous linear-gradient across hours", () => {
    const gradient = skyBandGradient([
      {
        forecast_time: "2026-09-28T03:00:00.000Z",
        cloud_cover: 0,
        sunrise_at: sunrise,
        sunset_at: sunset,
      },
      {
        forecast_time: "2026-09-28T10:00:00.000Z",
        cloud_cover: 10,
        sunrise_at: sunrise,
        sunset_at: sunset,
      },
      {
        forecast_time: "2026-09-28T20:00:00.000Z",
        cloud_cover: 0,
        sunrise_at: sunrise,
        sunset_at: sunset,
      },
    ]);
    expect(gradient.startsWith("linear-gradient(to right,")).toBe(true);
    expect(gradient).toContain("var(--sky-");
    expect(gradient).toContain("%");
  });

  it("maps WMO weather codes to plain labels", () => {
    expect(weatherCodeLabel(1)).toBe("Mainly clear");
    expect(weatherCodeLabel(61)).toBe("Slight rain");
    expect(weatherCodeLabel(95)).toBe("Thunderstorm");
    expect(weatherCodeLabel(null)).toBe("—");
  });

  it("flags stale forecasts after 6 hours", () => {
    const now = Date.parse("2026-09-28T18:00:00.000Z");
    expect(forecastIsStale("2026-09-28T17:00:00.000Z", now)).toBe(false);
    expect(
      forecastIsStale(
        new Date(now - FORECAST_STALE_AFTER_MS - 1).toISOString(),
        now,
      ),
    ).toBe(true);
    expect(forecastIsStale(null, now)).toBe(true);
  });

  it("flags stale advisory digests after 24 hours", () => {
    const now = Date.parse("2026-09-28T18:00:00.000Z");
    expect(digestIsStale("2026-09-28T12:00:00.000Z", now)).toBe(false);
    expect(digestIsStale("2026-08-23T18:12:12.593Z", now)).toBe(true);
    expect(digestIsStale(null, now)).toBe(true);
  });
});
