/** Tomato moisture stability and cracking/BER risk. Python mirror: tomato_moisture_stability.py */

import { getCropStage } from "../growingConstants";
import {
  MOISTURE_DEPLETION_FRACTION,
  MOISTURE_WEEKLY_MM_MAX,
  MOISTURE_WEEKLY_MM_MIN,
  MOISTURE_WEEKLY_NOTE,
  SOIL_TEXTURE_DEPLETION_PCT,
  SOIL_TEXTURE_PROVENANCE,
} from "./constants";
import type { DailyClimate } from "./climateMerge";
import { num, parseAt } from "./utils";

export interface MoistureStabilityAssessment {
  depletion_threshold_pct: number;
  consecutive_dry_days: number;
  swing_count: number;
  cracking_risk: boolean;
  headline: string;
  weekly_context: string;
  provenance: string;
}

export function depletionThresholdPct(
  cropType: string,
  lifecycleStage: string,
  soilTexture: string | null,
): number {
  const stage = getCropStage(cropType, lifecycleStage);
  const upper = stage.moisture_max_pct ?? 80;
  const textureFloor =
    SOIL_TEXTURE_DEPLETION_PCT[soilTexture ?? "loam"] ?? 60;
  return Math.max(textureFloor, upper * (1 - MOISTURE_DEPLETION_FRACTION));
}

export function assessMoistureStability(
  readings: Array<Record<string, unknown>>,
  _dailySeries: DailyClimate[],
  forecastRows: Array<Record<string, unknown>>,
  options: {
    cropType: string;
    lifecycleStage: string;
    soilTexture: string | null;
    dryStreakDays?: number;
    precipProbPct?: number;
    precipMm?: number;
    now?: Date;
  },
): MoistureStabilityAssessment {
  const {
    cropType,
    lifecycleStage,
    soilTexture,
    dryStreakDays = 3,
    precipProbPct = 50,
    precipMm = 5,
    now = new Date(),
  } = options;

  const threshold = depletionThresholdPct(
    cropType,
    lifecycleStage,
    soilTexture,
  );
  const stage = getCropStage(cropType, lifecycleStage);
  const upper = stage.moisture_max_pct ?? 80;

  const moistures = readings
    .filter((r) => r.moisture_pct != null)
    .map((r) => ({
      at: String(r.recorded_at),
      moisture: Number(r.moisture_pct),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));

  let consecutiveDry = 0;
  let maxDry = 0;
  let swingCount = 0;
  for (const { moisture } of moistures.slice(-500)) {
    const below = moisture < threshold;
    if (below) {
      consecutiveDry += 1;
      maxDry = Math.max(maxDry, consecutiveDry);
    } else {
      consecutiveDry = 0;
    }
    if (below && moisture > upper * 0.95) swingCount += 1;
  }

  const influx = forecastInflux(forecastRows, now, precipProbPct, precipMm);
  const cracking = maxDry >= dryStreakDays && influx;
  const headline = cracking
    ? "Cracking/blossom-end-rot risk: heavy moisture influx forecast after a dry stretch."
    : "No cracking/BER influx risk detected.";

  return {
    depletion_threshold_pct: threshold,
    consecutive_dry_days: maxDry,
    swing_count: swingCount,
    cracking_risk: cracking,
    headline,
    weekly_context: `Reference ${MOISTURE_WEEKLY_MM_MIN.toFixed(0)}-${MOISTURE_WEEKLY_MM_MAX.toFixed(0)} mm/week during fruit development (${MOISTURE_WEEKLY_NOTE}).`,
    provenance: SOIL_TEXTURE_PROVENANCE,
  };
}

function forecastInflux(
  forecastRows: Array<Record<string, unknown>>,
  now: Date,
  precipProbPct: number,
  precipMm: number,
): boolean {
  const end = now.getTime() + 48 * 3600_000;
  let dailyPrecip = 0;
  for (const row of forecastRows) {
    const at = parseAt(row.forecast_time);
    if (at == null) continue;
    const t = at.getTime();
    if (t < now.getTime() || t > end) continue;
    const prob = num(row.precipitation_probability) ?? 0;
    if (prob >= precipProbPct) return true;
    dailyPrecip += num(row.precipitation) ?? 0;
  }
  return dailyPrecip >= precipMm;
}
