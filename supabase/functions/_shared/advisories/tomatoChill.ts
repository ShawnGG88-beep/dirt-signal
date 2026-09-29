/** Tomato forecast chill, frost and blossom-drop assessment. Python mirror: tomato_chill.py */

import { isNightPeriod, localDayKey } from "../dayNight";
import {
  TOMATO_BLOSSOM_DROP_C,
  TOMATO_CHILL_MAX_C,
  TOMATO_FROST_C,
  TOMATO_SLOW_GROWTH_MAX_C,
} from "./constants";
import { num, parseAt } from "./utils";

export interface ChillNight {
  date: string;
  low_c: number;
  tier: string;
}

export interface TomatoChillAssessment {
  nights: ChillNight[];
  highest_tier: string | null;
  message: string;
}

const TIER_ORDER = ["frost", "chilling", "blossom_drop", "slow_growth"];

export function assessTomatoChill(
  forecastRows: Array<Record<string, unknown>>,
  tzName: string,
  options: { lifecycleStage: string; now?: Date } = { lifecycleStage: "vegetative_growth" },
): TomatoChillAssessment {
  const { lifecycleStage } = options;
  const byNight = new Map<string, number[]>();

  for (const row of forecastRows) {
    const temp = num(row.temperature_2m);
    const ft = row.forecast_time;
    if (ft == null || temp == null) continue;
    const recorded = parseAt(ft);
    if (recorded == null || !isNightPeriod(recorded, tzName)) continue;
    const day = localDayKey(recorded, tzName);
    if (!byNight.has(day)) byNight.set(day, []);
    byNight.get(day)!.push(temp);
  }

  const nights: ChillNight[] = [];
  for (const [day, temps] of [...byNight.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const low = Math.min(...temps);
    const tier = tierForLow(low, lifecycleStage);
    if (tier) nights.push({ date: day, low_c: low, tier });
  }

  const highest =
    nights.length === 0
      ? null
      : nights.reduce(
          (best, n) =>
            TIER_ORDER.indexOf(n.tier) < TIER_ORDER.indexOf(best)
              ? n.tier
              : best,
          nights[0].tier,
        );

  if (nights.length === 0) {
    return {
      nights: [],
      highest_tier: null,
      message:
        "No chill, frost or blossom-drop risk in the forecast window.",
    };
  }

  const parts = nights.map(
    (n) => `${n.date}: ${n.low_c.toFixed(1)}°C (${n.tier})`,
  );
  return {
    nights,
    highest_tier: highest,
    message: "Forecast nights at risk: " + parts.join("; "),
  };
}

function tierForLow(
  lowC: number,
  lifecycleStage: string,
): string | null {
  if (lowC <= TOMATO_FROST_C) return "frost";
  if (lifecycleStage === "flowering" && lowC <= TOMATO_BLOSSOM_DROP_C)
    return "blossom_drop";
  if (lowC <= TOMATO_CHILL_MAX_C) return "chilling";
  if (lowC <= TOMATO_SLOW_GROWTH_MAX_C) return "slow_growth";
  return null;
}
