import { describe, expect, it } from "vitest";
import { grapeFrostThresholdC, getGrapeFrostProfile } from "./grapeFrost";
import {
  GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION,
  getGrapeWineCultivarProfile,
} from "../growingConstants";
import { projectDrydown } from "../derived";

describe("grape frost lookup", () => {
  it("selects Cabernet Sauvignon's table, not Pinot Noir's", () => {
    const cabernet = grapeFrostThresholdC("cabernet_sauvignon");
    const pinot = grapeFrostThresholdC("pinot_noir");
    expect(cabernet).not.toBeNull();
    expect(pinot).not.toBeNull();
    expect(cabernet?.threshold_c).toBe(-3.9);
    expect(cabernet?.coverage).toBe("single_point");
    expect(pinot?.coverage).toBe("el_staged_table");
    expect(pinot?.threshold_c).toBe(-3.3);
    expect(cabernet?.threshold_c).not.toBe(pinot?.threshold_c);
    expect(getGrapeFrostProfile("cabernet_sauvignon")?.el_rows).toBeNull();
    expect(getGrapeFrostProfile("pinot_noir")?.el_rows?.length).toBe(4);
  });

  it("resolves Pinot Noir E-L rows without inventing in-between values", () => {
    expect(grapeFrostThresholdC("pinot_noir", 4)?.threshold_c).toBe(-2.2);
    expect(grapeFrostThresholdC("pinot_noir", 9)?.threshold_c).toBe(-1.7);
    expect(grapeFrostThresholdC("pinot_noir", 11)?.threshold_c).toBe(-1.1);
  });

  it("tags Chardonnay as a single-point budswell reference", () => {
    const chardonnay = grapeFrostThresholdC("chardonnay");
    expect(chardonnay?.coverage).toBe("single_point");
    expect(chardonnay?.threshold_c).toBe(-2.8);
    expect(grapeFrostThresholdC(null)).toBeNull();
  });
});

describe("grape water-stress reference", () => {
  it("retrieves Cabernet Psi_stem tagged as stem_water_potential", () => {
    const water =
      getGrapeWineCultivarProfile("cabernet_sauvignon")?.water_stress;
    expect(water?.metric_type).toBe("stem_water_potential");
    expect(water?.drives_irrigation).toBe(false);
    expect(GRAPE_WINE_WATER_STRESS_DRIVES_IRRIGATION).toBe(false);
    const stages = Object.fromEntries(
      (water?.stages ?? []).map((row) => [
        row.phenological_stage,
        row.psi_stem_mpa,
      ]),
    );
    expect(stages["2 weeks pre-bloom"]).toBe(-0.6);
    expect(stages["Bunch closure"]).toBe(-0.8);
    expect(stages["Veraison initiation"]).toBe(-1.0);
    expect(stages["End of veraison"]).toBe(-1.2);
  });

  it("tags Chardonnay as leaf_water_potential_gs50 and leaves Pinot as an open gap", () => {
    const chardonnay =
      getGrapeWineCultivarProfile("chardonnay")?.water_stress;
    const pinot = getGrapeWineCultivarProfile("pinot_noir")?.water_stress;
    expect(chardonnay?.metric_type).toBe("leaf_water_potential_gs50");
    expect(chardonnay?.psi_mpa).toBe(-1.22);
    expect(chardonnay?.drives_irrigation).toBe(false);
    expect(pinot?.metric_type).toBeNull();
    expect(pinot?.open_gap).toBe(true);
  });

  it("does not accept water-potential fields on the dry-down irrigation path", () => {
    const src = projectDrydown.toString().toLowerCase();
    expect(src).not.toContain("psi");
    expect(src).not.toContain("water_stress");
    expect(src).not.toContain("stem_water_potential");
    const result = projectDrydown([], [], {
      moistureLowerBound: 40,
      now: new Date("2026-08-24T12:00:00Z"),
    });
    expect(result.projection).toBeNull();
  });
});
