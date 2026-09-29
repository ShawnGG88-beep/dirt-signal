import { describe, expect, it } from "vitest";
import {
  buildNeedsAttentionItems,
  buildStatusSentence,
  attentionClausesFromLanes,
  metricToTileStatus,
  sparklineIsSteady,
} from "./dashboardStatus";

describe("dashboardStatus", () => {
  it("maps needs_calibration to watch, not a new status", () => {
    const view = metricToTileStatus({
      status: "unknown",
      bounds: null,
      position: null,
      reason: "needs_calibration",
    });
    expect(view.status).toBe("watch");
    expect(view.label).toBe("needs field calibration");
  });

  it("maps out-of-bounds warn to act", () => {
    const view = metricToTileStatus({
      status: "warn",
      bounds: { min: 6, max: 7 },
      position: -2,
    });
    expect(view.status).toBe("act");
    expect(view.label).toBe("out of bounds");
  });

  it("maps grape cold soil zones to cold", () => {
    const view = metricToTileStatus({
      status: "warn",
      bounds: { min: 21, max: 24 },
      position: -1,
      zoneId: "impaired",
      zoneLabel: "Root activity beginning, nutrient uptake impaired",
    });
    expect(view.status).toBe("cold");
  });

  it("marks stale readings as stale", () => {
    const view = metricToTileStatus(
      { status: "ok", bounds: { min: 1, max: 2 }, position: 0.5 },
      {
        recordedAt: "2026-09-12T11:31:00.000Z",
        nowMs: Date.parse("2026-09-29T06:00:00.000Z"),
        staleAfterMs: 60_000,
      },
    );
    expect(view.status).toBe("stale");
    expect(view.label).toBe("Stale");
  });

  it("builds a plain status sentence", () => {
    const sentence = buildStatusSentence({
      metricLabels: ["a", "b", "c", "d", "e", "f"],
      reportingCount: 6,
      moistureSteady: true,
      attentionClauses: ["Storm risk this morning"],
    });
    expect(sentence).toBe(
      "All 6 sensors reporting. Soil moisture steady. Storm risk this morning.",
    );
  });

  it("elevates act metrics and actionable lanes into needs attention", () => {
    const items = buildNeedsAttentionItems({
      metrics: [
        {
          key: "ph",
          label: "pH",
          score: {
            status: "warn",
            bounds: { min: 6, max: 7 },
            position: -1,
          },
        },
        {
          key: "moisture_pct",
          label: "Moisture",
          score: {
            status: "unknown",
            bounds: null,
            position: null,
            reason: "needs_calibration",
          },
        },
      ],
      lanes: [
        {
          id: "storm",
          kind: "storm",
          title: "Storm risk",
          pattern: "outline",
          shadowMode: true,
          provisional: true,
          granularity: "hourly",
          segments: [],
          summary: "Storm risk: thunderstorm weather codes in the window.",
          actionable: true,
        },
        {
          id: "water_use",
          kind: "water_use",
          title: "Water use (ET0)",
          pattern: "sparkline",
          shadowMode: true,
          granularity: "hourly",
          segments: [],
          summary: "Water use (ET0) 1.0 mm over the visible window.",
          actionable: false,
        },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["metric:ph", "lane:storm"]);
    expect(items[0].detail).toBe("out of bounds");
    expect(items[0].status).toBe("act");
  });

  it("states staleness inline on needs attention when the reading is old", () => {
    const items = buildNeedsAttentionItems({
      metrics: [
        {
          key: "ph",
          label: "pH",
          recordedAt: "2026-09-12T11:31:00.000Z",
          score: {
            status: "warn",
            bounds: { min: 6, max: 7 },
            position: -1,
          },
        },
      ],
      lanes: [],
      nowMs: Date.parse("2026-09-29T06:00:00.000Z"),
      staleAfterMs: 60_000,
    });
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("stale");
    expect(items[0].detail).toBe(
      "was out of bounds, last reading 16 d ago",
    );
  });

  it("builds spray window clauses from actionable lanes", () => {
    const clauses = attentionClausesFromLanes(
      [
        {
          id: "spray",
          kind: "spray",
          title: "Spray window",
          pattern: "solid",
          shadowMode: true,
          granularity: "hourly",
          segments: [
            {
              start: "2026-09-30T06:00:00.000Z",
              end: "2026-09-30T10:00:00.000Z",
              intensity: 1,
            },
          ],
          summary: "Spray window open.",
          actionable: true,
        },
      ],
      "Africa/Johannesburg",
    );
    expect(clauses[0]).toMatch(/^Spray window \w+ morning$/);
  });

  it("detects steady sparklines", () => {
    expect(sparklineIsSteady([10, 10.1, 9.95, 10])).toBe(true);
    expect(sparklineIsSteady([10, 12, 14])).toBe(false);
    expect(sparklineIsSteady([10])).toBe(null);
  });
});
