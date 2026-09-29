import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  forecastDailyTempsFromHourly,
  grapeWineSeasonStartHint,
  inferGrapeWineStage,
  inferTomatoStage,
  lookupElToBbch,
  accumulateObservedGdd,
  projectGddFromForecast,
} from "./phenology";
import {
  CROP_PROFILES,
  TOMATO_GDD_STAGE_BANDS,
  TOMATO_LIFECYCLE_STAGES,
  getCropStage,
  shouldAccumulateGdd,
} from "./growingConstants";
import { assessTomatoChill } from "./advisories/tomatoChill";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = join(ROOT, "shared/fixtures/phenology_cases.json");

interface PhenologyFixture {
  season_start_hint: {
    id: string;
    as_of: string;
    timezone: string;
    expect: string;
  }[];
  infer_stage: {
    id: string;
    cumulative_gdd: number;
    expect_stage: string;
  }[];
  el_to_bbch: {
    id: string;
    el: number;
    expect_phase: string | null;
  }[];
  forecast_daily: {
    timezone: string;
    hourly: { forecast_time: string; temperature_2m: number }[];
    expect_days: { day: string; t_max_c: number; t_min_c: number }[];
  };
  projection: {
    accumulated_gdd: number;
    as_of_day: string;
    forecast_days: { day: string; t_max_c: number; t_min_c: number }[];
    expect_first_confidence: string;
    expect_transition_threshold: string;
    expect_transition_day: string;
  };
}

describe("phenology fixtures", () => {
  const cases = JSON.parse(readFileSync(FIXTURE, "utf-8")) as PhenologyFixture;

  it("grapeWineSeasonStartHint", () => {
    for (const c of cases.season_start_hint) {
      expect(
        grapeWineSeasonStartHint(new Date(c.as_of), c.timezone),
        c.id,
      ).toBe(c.expect);
    }
  });

  it("inferGrapeWineStage", () => {
    for (const c of cases.infer_stage) {
      const result = inferGrapeWineStage(c.cumulative_gdd);
      expect(result?.stage, c.id).toBe(c.expect_stage);
      expect(result?.provenance, c.id).toContain("Northern Hemisphere");
    }
  });

  it("lookupElToBbch", () => {
    for (const c of cases.el_to_bbch) {
      const result = lookupElToBbch(c.el);
      if (c.expect_phase == null) {
        expect(result, c.id).toBeNull();
      } else {
        expect(result?.phase, c.id).toBe(c.expect_phase);
      }
    }
  });

  it("forecastDailyTempsFromHourly", () => {
    const fd = cases.forecast_daily;
    const daily = forecastDailyTempsFromHourly(fd.hourly, fd.timezone);
    expect(daily).toEqual(fd.expect_days);
  });

  it("projectGddFromForecast", () => {
    const p = cases.projection;
    const result = projectGddFromForecast({
      accumulatedGdd: p.accumulated_gdd,
      forecastDays: p.forecast_days,
      asOfDay: p.as_of_day,
    });
    expect(result.days[0]?.confidence).toBe(p.expect_first_confidence);
    const transition = result.stage_transitions.find(
      (t) => t.threshold === p.expect_transition_threshold,
    );
    expect(transition?.projected_day).toBe(p.expect_transition_day);
    expect(result.provenance).toContain("Northern Hemisphere");
  });
});

describe("tomato six-stage lifecycle", () => {
  it("exposes the six new tomato stages in order and drops mature/fruiting", () => {
    expect(Object.keys(CROP_PROFILES.tomato.stages)).toEqual([
      ...TOMATO_LIFECYCLE_STAGES,
    ]);
    expect(CROP_PROFILES.tomato.stages).not.toHaveProperty("mature");
    expect(CROP_PROFILES.tomato.stages).not.toHaveProperty("fruiting");
    expect(CROP_PROFILES.grape_wine.stages).toHaveProperty("mature");
  });

  it("maps leftover tomato mature/fruiting lookups onto the new stages", () => {
    expect(getCropStage("tomato", "mature")).toBe(
      getCropStage("tomato", "vegetative_growth"),
    );
    expect(getCropStage("tomato", "fruiting")).toBe(
      getCropStage("tomato", "fruit_development"),
    );
    expect(getCropStage("tomato", "fruit_development").moisture_min_pct).toBe(
      65,
    );
  });

  it("infers GDD-gated tomato stages without erroring on zero or null GDD", () => {
    expect(inferTomatoStage(null)).toBeNull();
    expect(inferTomatoStage(0)?.stage).toBe("seedling");
    expect(inferTomatoStage(584.9)?.stage).toBe("seedling");
    expect(inferTomatoStage(TOMATO_GDD_STAGE_BANDS.vegetative_growth)?.stage).toBe(
      "vegetative_growth",
    );
    expect(inferTomatoStage(TOMATO_GDD_STAGE_BANDS.flowering)?.stage).toBe(
      "flowering",
    );
    expect(inferTomatoStage(TOMATO_GDD_STAGE_BANDS.fruit_development)?.stage).toBe(
      "fruit_development",
    );
    expect(inferTomatoStage(TOMATO_GDD_STAGE_BANDS.ripening)?.stage).toBe(
      "ripening",
    );
  });

  it("starts GDD accumulation at seedling, not germination", () => {
    const daily = [{ day: "2026-08-01", gdd_day: 12, incomplete: false }];
    const seedling = accumulateObservedGdd(
      daily,
      "2026-08-01",
      "tomato",
      "seedling",
    );
    const germination = accumulateObservedGdd(
      daily,
      "2026-08-01",
      "tomato",
      "germination",
    );
    expect(seedling.cumulative_gdd).toBe(12);
    expect(germination.cumulative_gdd).toBe(0);
    expect(shouldAccumulateGdd("tomato", "germination")).toBe(false);
    expect(shouldAccumulateGdd("tomato", "seedling")).toBe(true);
    expect(shouldAccumulateGdd("grape_wine", "mature")).toBe(true);
  });

  it("blossom-drop gates on flowering, not fruit_development or fruiting", () => {
    const rows = [
      {
        forecast_time: "2026-07-23T02:00:00.000Z",
        temperature_2m: 12,
      },
    ];
    const flowering = assessTomatoChill(rows, "UTC", {
      lifecycleStage: "flowering",
      now: new Date("2026-07-23T02:00:00.000Z"),
    });
    const fruit = assessTomatoChill(rows, "UTC", {
      lifecycleStage: "fruit_development",
      now: new Date("2026-07-23T02:00:00.000Z"),
    });
    const retired = assessTomatoChill(rows, "UTC", {
      lifecycleStage: "fruiting",
      now: new Date("2026-07-23T02:00:00.000Z"),
    });
    expect(flowering.nights.some((n) => n.tier === "blossom_drop")).toBe(true);
    expect(fruit.nights.some((n) => n.tier === "blossom_drop")).toBe(false);
    expect(retired.nights.some((n) => n.tier === "blossom_drop")).toBe(false);
  });
});

describe("grape_wine cultivars", () => {
  it("null cultivar keeps the shared Chardonnay GDD working points", () => {
    expect(inferGrapeWineStage(74)?.stage).toBe("pre_budburst");
    expect(inferGrapeWineStage(75)?.stage).toBe("budburst");
    expect(inferGrapeWineStage(75, null)?.stage).toBe("budburst");
    expect(inferGrapeWineStage(75, "chardonnay")?.stage).toBe("budburst");
    expect(inferGrapeWineStage(75, "pinot_noir")?.stage).toBe("budburst");
    expect(inferGrapeWineStage(100, "chardonnay")?.stage).toBe("budburst");
  });

  it("infers Cabernet Sauvignon stages at the four working thresholds", () => {
    expect(inferGrapeWineStage(83.9, "cabernet_sauvignon")?.stage).toBe(
      "pre_budburst",
    );
    expect(inferGrapeWineStage(84, "cabernet_sauvignon")?.stage).toBe("budburst");
    expect(inferGrapeWineStage(374.9, "cabernet_sauvignon")?.stage).toBe(
      "budburst",
    );
    expect(inferGrapeWineStage(375, "cabernet_sauvignon")?.stage).toBe(
      "flowering",
    );
    expect(inferGrapeWineStage(1199.9, "cabernet_sauvignon")?.stage).toBe(
      "flowering",
    );
    expect(inferGrapeWineStage(1200, "cabernet_sauvignon")?.stage).toBe(
      "veraison",
    );
    expect(inferGrapeWineStage(1449.9, "cabernet_sauvignon")?.stage).toBe(
      "veraison",
    );
    expect(inferGrapeWineStage(1450, "cabernet_sauvignon")?.stage).toBe(
      "harvest",
    );
  });

  it("does not treat Cabernet harvest GDD as the Winkler Region II-III total", () => {
    const harvest =
      inferGrapeWineStage(1450, "cabernet_sauvignon")?.stage;
    expect(harvest).toBe("harvest");
    expect(inferGrapeWineStage(2500, "cabernet_sauvignon")?.stage).toBe(
      "harvest",
    );
  });
});
