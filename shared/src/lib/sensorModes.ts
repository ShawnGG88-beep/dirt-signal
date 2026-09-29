/**
 * Map dashboard metric keys onto collector config *_mode fields.
 */

import type { MetricKey } from "./metrics";

export type SensorMode = "mock" | "real";

export interface DeviceSensorModes {
  moisture_mode?: string | null;
  ph_mode?: string | null;
  ds18b20_mode?: string | null;
  dht22_mode?: string | null;
  npk_mode?: string | null;
}

/** True when the stream (or its source ambient probe) is configured mock. */
export function metricIsSimulated(
  key: MetricKey,
  modes: DeviceSensorModes | null | undefined,
): boolean {
  if (!modes) return false;
  const mode = modeForMetric(key, modes);
  return mode === "mock";
}

function modeForMetric(
  key: MetricKey,
  modes: DeviceSensorModes,
): string | null | undefined {
  switch (key) {
    case "moisture_pct":
    case "moisture_raw":
      return modes.moisture_mode;
    case "ph":
      return modes.ph_mode;
    case "soil_temp_c":
      return modes.ds18b20_mode;
    case "ambient_temp_c":
    case "ambient_humidity_pct":
    case "vpd_kpa":
    case "dew_point_c":
      return modes.dht22_mode;
    default:
      return null;
  }
}
