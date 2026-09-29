/** Daily weather advisory digest. Python mirror: digest.py */

import { buildDailyClimateSeries } from "./climateMerge";
import { suggestCaptureTime } from "./captureSchedule";
import {
  commitClosedDaysInMemory,
  defaultDsvRow,
  type DeviceDsvRow,
} from "./dsvStore";
import { findSprayWindow } from "./sprayWindow";
import { assessTomatoChill } from "./tomatoChill";
import { assessMoistureStability } from "./tomatoMoistureStability";
import { assessPowderyMildew } from "./tomatoPowderyMildew";
import { DISEASE_KEYS, type DiseaseKey } from "./constants";

export type { DeviceDsvRow } from "./dsvStore";
export type { DiseaseKey } from "./constants";

export interface DailyAdvisoryDigest {
  device_id: string;
  crop_type: string;
  lifecycle_stage: string;
  evaluated_at: string;
  spray_window: ReturnType<typeof findSprayWindow>;
  capture_suggestion: ReturnType<typeof suggestCaptureTime>;
  tomato: TomatoAdvisoryBlock | null;
}

export interface TomatoAdvisoryBlock {
  chill: ReturnType<typeof assessTomatoChill>;
  diseases: Array<{
    key: DiseaseKey;
    accumulated_dsv: number;
    threshold: number;
    spray_recommended: boolean;
    last_computed_day: string | null;
  }>;
  powdery_mildew: ReturnType<typeof assessPowderyMildew>;
  moisture: ReturnType<typeof assessMoistureStability>;
}

export interface BuildDailyDigestInput {
  device: Record<string, unknown>;
  readings: Array<Record<string, unknown>>;
  forecastRows: Array<Record<string, unknown>>;
  dsvRows: Map<DiseaseKey, DeviceDsvRow>;
  lightCondition?: string;
  now?: Date;
  ruleParams?: Partial<Record<DiseaseKey, Record<string, unknown>>>;
}

export interface BuildDailyDigestResult {
  digest: DailyAdvisoryDigest;
  updatedDsvRows: DeviceDsvRow[];
}

export function buildDailyDigest(
  input: BuildDailyDigestInput,
): BuildDailyDigestResult {
  const {
    device,
    readings,
    forecastRows,
    dsvRows,
    lightCondition = "unknown",
    now = new Date(),
    ruleParams = {},
  } = input;

  const deviceId = String(device.id);
  const crop = String(device.crop_type ?? "tomato");
  const stage = String(device.lifecycle_stage ?? "mature");
  const tzName = String(device.timezone ?? "Africa/Johannesburg");

  const spray = findSprayWindow(forecastRows, { now });
  const capture = suggestCaptureTime(forecastRows, tzName, {
    lightCondition,
    now,
  });

  const updatedDsvRows: DeviceDsvRow[] = [];
  let tomatoBlock: TomatoAdvisoryBlock | null = null;

  if (crop === "tomato") {
    const daily = buildDailyClimateSeries(readings, forecastRows, tzName, {
      now,
    });
    const chill = assessTomatoChill(forecastRows, tzName, {
      lifecycleStage: stage,
      now,
    });
    const mildew = assessPowderyMildew(daily);
    const moisture = assessMoistureStability(readings, daily, forecastRows, {
      cropType: crop,
      lifecycleStage: stage,
      soilTexture: (device.soil_texture as string | null) ?? null,
      now,
    });

    const diseases: TomatoAdvisoryBlock["diseases"] = [];
    for (const key of DISEASE_KEYS) {
      const existing =
        dsvRows.get(key) ?? defaultDsvRow(deviceId, key);
      const { row } = commitClosedDaysInMemory(existing, daily, {
        now,
        tzName,
        params: ruleParams[key] ?? null,
      });
      updatedDsvRows.push(row);
      diseases.push({
        key,
        accumulated_dsv: row.accumulated_dsv,
        threshold: row.threshold,
        spray_recommended: row.spray_recommended,
        last_computed_day: row.last_computed_day,
      });
    }

    tomatoBlock = {
      chill,
      diseases,
      powdery_mildew: mildew,
      moisture,
    };
  }

  const digest: DailyAdvisoryDigest = {
    device_id: deviceId,
    crop_type: crop,
    lifecycle_stage: stage,
    evaluated_at: now.toISOString(),
    spray_window: spray,
    capture_suggestion: capture,
    tomato: tomatoBlock,
  };

  return { digest, updatedDsvRows };
}
