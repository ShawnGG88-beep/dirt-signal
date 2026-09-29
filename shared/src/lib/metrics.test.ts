import { describe, expect, it } from "vitest";
import {
  GRAPE_ROOT_SURVIVAL_RISK_C,
  GRAPE_ROOT_ZONE_TEMP_ZONES,
  getCropStage,
  grapeRootZoneTempZone,
} from "./growingConstants";
import {
  getMetricBoundsForProfile,
  moistureDepletionPct,
  scoreGrapeSoilTemp,
  scoreMetricForProfile,
  scoreMetricValue,
  scoreMoistureDepletion,
} from "./metrics";

describe("grape root-zone temperature zones", () => {
  it("exposes six ordered zones with the sourced 29.7°C heat boundary", () => {
    expect(GRAPE_ROOT_ZONE_TEMP_ZONES).toHaveLength(6);
    expect(GRAPE_ROOT_ZONE_TEMP_ZONES.map((z) => z.id)).toEqual([
      "dormant",
      "impaired",
      "functional",
      "optimal",
      "above_optimal",
      "heat_stress",
    ]);
    expect(GRAPE_ROOT_ZONE_TEMP_ZONES[4].max_c).toBe(29.7);
    expect(GRAPE_ROOT_ZONE_TEMP_ZONES[5].min_c).toBe(29.7);
    expect(GRAPE_ROOT_SURVIVAL_RISK_C).toBe(35.0);
  });

  it("maps boundary temperatures to the correct zone", () => {
    expect(grapeRootZoneTempZone(7.9).id).toBe("dormant");
    expect(grapeRootZoneTempZone(8).id).toBe("impaired");
    expect(grapeRootZoneTempZone(12.9).id).toBe("impaired");
    expect(grapeRootZoneTempZone(13).id).toBe("functional");
    expect(grapeRootZoneTempZone(20.9).id).toBe("functional");
    expect(grapeRootZoneTempZone(21).id).toBe("optimal");
    expect(grapeRootZoneTempZone(23.9).id).toBe("optimal");
    expect(grapeRootZoneTempZone(24).id).toBe("above_optimal");
    expect(grapeRootZoneTempZone(29.699).id).toBe("above_optimal");
    expect(grapeRootZoneTempZone(29.7).id).toBe("heat_stress");
    expect(grapeRootZoneTempZone(36).id).toBe("heat_stress");
  });

  it("scores grape soil temp via zones and bypasses restraint", () => {
    // mature grape_wine is restraint — cold must still warn
    const cold = scoreGrapeSoilTemp(10);
    expect(cold.status).toBe("warn");
    expect(cold.zoneId).toBe("impaired");

    const optimal = scoreGrapeSoilTemp(22);
    expect(optimal.status).toBe("ok");
    expect(optimal.zoneId).toBe("optimal");

    const hot = scoreGrapeSoilTemp(31);
    expect(hot.status).toBe("warn");
    expect(hot.zoneId).toBe("heat_stress");

    const viaProfile = scoreMetricForProfile(
      "soil_temp_c",
      10,
      "grape_wine",
      "mature",
      null,
      "Africa/Johannesburg",
    );
    expect(viaProfile.status).toBe("warn");
    expect(viaProfile.zoneId).toBe("impaired");
  });

  it("sets ideal soil-temp band on both grape stages", () => {
    for (const stage of ["establishment", "mature"] as const) {
      const bounds = getMetricBoundsForProfile(
        "soil_temp_c",
        "grape_wine",
        stage,
      );
      expect(bounds).toEqual({ min: 21, max: 24 });
    }
  });
});

describe("moisture depletion scoring", () => {
  const anchors = { fieldCapacityPct: 60, refillPointPct: 30 };

  it("returns needs_calibration when anchors are missing", () => {
    const score = scoreMoistureDepletion(45, null);
    expect(score.status).toBe("unknown");
    expect(score.reason).toBe("needs_calibration");

    const partial = scoreMoistureDepletion(45, {
      fieldCapacityPct: 60,
      refillPointPct: null,
    });
    expect(partial.reason).toBe("needs_calibration");
  });

  it("computes depletion percent between anchors", () => {
    expect(moistureDepletionPct(60, anchors)).toBe(0);
    expect(moistureDepletionPct(30, anchors)).toBe(100);
    expect(moistureDepletionPct(45, anchors)).toBe(50);
  });

  it("scores ok / watch / warn on depletion", () => {
    expect(scoreMoistureDepletion(50, anchors).status).toBe("ok");
    // within 10% of span (3 pts) of refill → watch
    expect(scoreMoistureDepletion(32, anchors).status).toBe("watch");
    expect(scoreMoistureDepletion(30, anchors).status).toBe("warn");
    expect(scoreMoistureDepletion(25, anchors).status).toBe("warn");
    // above field capacity → watch
    expect(scoreMoistureDepletion(65, anchors).status).toBe("watch");
  });

  it("routes grape moisture through depletion, not a fabricated band", () => {
    expect(
      getMetricBoundsForProfile("moisture_pct", "grape_wine", "mature"),
    ).toBeNull();
    expect(getCropStage("grape_wine", "mature").moisture_min_pct).toBeUndefined();

    const unanchored = scoreMetricForProfile(
      "moisture_pct",
      40,
      "grape_wine",
      "mature",
      null,
      "Africa/Johannesburg",
      { anchors: null },
    );
    expect(unanchored.status).toBe("unknown");
    expect(unanchored.reason).toBe("needs_calibration");

    const anchored = scoreMetricForProfile(
      "moisture_pct",
      45,
      "grape_wine",
      "mature",
      null,
      "Africa/Johannesburg",
      { anchors },
    );
    expect(anchored.status).toBe("ok");
    expect(anchored.depletionPct).toBe(50);
    expect(anchored.bounds).toEqual({ min: 30, max: 60 });
  });
});

describe("tomato moisture band regression", () => {
  it("keeps the tomato moisture band and does not use depletion", () => {
    const bounds = getMetricBoundsForProfile(
      "moisture_pct",
      "tomato",
      "vegetative_growth",
    );
    expect(bounds).toEqual({ min: 60, max: 80 });

    const score = scoreMetricForProfile(
      "moisture_pct",
      70,
      "tomato",
      "vegetative_growth",
      null,
      "Africa/Johannesburg",
      {
        anchors: { fieldCapacityPct: 60, refillPointPct: 30 },
      },
    );
    // Band wins even if anchors are present
    expect(score.status).toBe("ok");
    expect(score.depletionPct).toBeUndefined();
    expect(score.bounds).toEqual({ min: 60, max: 80 });
  });

  it("still scores tomato soil temp against the ideal band", () => {
    const score = scoreMetricValue(
      20,
      getMetricBoundsForProfile("soil_temp_c", "tomato", "vegetative_growth"),
      "optimal_band",
    );
    expect(score.status).toBe("ok");
  });
});
