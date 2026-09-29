import { describe, expect, it } from "vitest";
import cases from "../../../fixtures/weather_advisory_cases.json";
import {
  applyDailyDsv,
  buildDailyClimateSeries,
  daysToCommit,
  type DailyClimate,
} from "./index";
import { scoreEarlyBlightDay } from "./tomatoEarlyBlight";
import { assessTomatoChill } from "./tomatoChill";

function forecastRow(at: string, tempC: number): Record<string, unknown> {
  return {
    forecast_time: at,
    temperature_2m: tempC,
    relative_humidity_2m: 80,
    precipitation_probability: 10,
    precipitation: 0,
    wind_speed_10m: 5,
    cloud_cover: 40,
  };
}

describe("weather advisory parity", () => {
  it("daysToCommit skips open day", () => {
    const c = cases.days_to_commit;
    const days = daysToCommit(c.last_computed_day, c.today_local);
    expect(days).toEqual(c.expected);
    expect(days).not.toContain(c.today_local);
  });

  it("DSV mid-day idempotency", () => {
    const c = cases.dsv_midday;
    const state = applyDailyDsv({
      accumulated: c.accumulated,
      threshold: c.threshold,
      dailyScore: c.daily_score,
      daysSinceReset: c.days_since_reset,
    });
    expect(state.accumulated).toBe(c.expected_accumulated_after_first);
    const again = applyDailyDsv({
      accumulated: state.accumulated,
      threshold: c.threshold,
      dailyScore: c.daily_score,
      daysSinceReset: state.days_since_reset,
    });
    expect(again.accumulated).toBe(0);
    expect(again.spray_recommended).toBe(c.expected_spray_after_second);
  });

  it("forecast never backfills observed gap", () => {
    const c = cases.forecast_merge;
    const now = new Date(c.now);
    const series = buildDailyClimateSeries(
      c.readings as Array<Record<string, unknown>>,
      c.forecast as Array<Record<string, unknown>>,
      c.tz,
      { now },
    );
    const byDay = Object.fromEntries(series.map((d) => [d.day, d.source]));
    expect(["unavailable", "observed"]).toContain(byDay["2026-08-21"]);
    for (const [day, source] of Object.entries(byDay)) {
      if (day > "2026-08-21") {
        expect(c.days_after_last_observed_must_be).toContain(source);
      }
    }
  });

  it("early blight observed only", () => {
    const c = cases.early_blight_observed;
    const observed: DailyClimate = {
      day: "2026-08-20",
      t_max_c: 28,
      t_min_c: 26,
      rh_mean_pct: 92,
      wet_hours: 8,
      precip_sum_mm: 0,
      source: "observed",
      coverage_hours: 20,
    };
    const forecast: DailyClimate = {
      ...observed,
      day: "2026-08-21",
      source: "forecast",
      coverage_hours: 24,
    };
    expect(scoreEarlyBlightDay(observed)).toBe(c.observed_score);
    expect(scoreEarlyBlightDay(forecast)).toBe(c.forecast_score);
  });

  it("tomato chill assesses forecast nights", () => {
    const c = cases.chill_forecast;
    const base = new Date(c.base);
    const rows = Array.from({ length: c.hours }, (_, h) =>
      forecastRow(
        new Date(base.getTime() + h * 3600_000).toISOString(),
        c.temp_c,
      ),
    );
    const assessment = assessTomatoChill(rows, "UTC", {
      lifecycleStage: c.lifecycle_stage,
      now: base,
    });
    expect(assessment.nights.length).toBeGreaterThan(0);
    expect(c.expect_risk).toBe(true);
  });
});
