/**
 * Data types shared by every Dirt Signal data source. Extracted verbatim
 * from the desktop sidecar client (desktop/src/lib/api.ts); the shapes are
 * the sidecar response shapes and every DataClient implementation must
 * return them unchanged.
 */

export interface SensorReading {
  id: number;
  device_id: string;
  recorded_at: string;
  moisture_raw: number | null;
  moisture_pct: number | null;
  soil_temp_c: number | null;
  ambient_temp_c: number | null;
  ambient_humidity_pct: number | null;
  ph: number | null;
  ec_us_cm: number | null;
  npk_n_est: number | null;
  npk_p_est: number | null;
  npk_k_est: number | null;
  /** Moisture % from the 7-in-1 NPK probe. Null on pre-NPK rows. */
  npk_moisture_pct?: number | null;
  /** Temperature °C from the 7-in-1 NPK probe. Null on pre-NPK rows. */
  npk_temp_c?: number | null;
  /** pH from the 7-in-1 NPK probe. Null on pre-NPK rows. */
  npk_ph?: number | null;
  probe_depth_cm?: number | null;
  /** Profile stamped at insert. Null on pre-provenance rows. */
  crop_type_at_reading?: string | null;
  lifecycle_stage_at_reading?: string | null;
}

export interface LatestReadingResponse {
  device_name: string;
  reading: SensorReading | null;
  crop_type?: string;
  lifecycle_stage?: string;
  device_id?: string | null;
  timezone?: string;
  season_start_date?: string | null;
  soil_texture?: string | null;
  cultivar?: string | null;
  /** HW-390 relative saturation % at field capacity. Null until calibrated. */
  soil_field_capacity_raw?: number | null;
  /** HW-390 relative saturation % at irrigation refill point. Null until set. */
  soil_refill_point_raw?: number | null;
}

export interface ReadingsRangeResponse {
  device_name: string;
  from_at: string;
  to_at: string;
  readings: SensorReading[];
  count: number;
  crop_type?: string;
  lifecycle_stage?: string;
  device_id?: string | null;
  timezone?: string;
  season_start_date?: string | null;
  soil_texture?: string | null;
  cultivar?: string | null;
  soil_field_capacity_raw?: number | null;
  soil_refill_point_raw?: number | null;
}

export interface DeviceResponse {
  id: string;
  name: string;
  crop_type: string;
  lifecycle_stage: string;
  timezone?: string;
  season_start_date?: string | null;
  soil_texture?: string | null;
  cultivar?: string | null;
  soil_field_capacity_raw?: number | null;
  soil_refill_point_raw?: number | null;
}

export interface ProfileStageOption {
  lifecycle_stage: string;
  display_name: string;
}

export interface ProfileCultivarOption {
  cultivar: string;
  display_name: string;
}

export interface ProfileCropOption {
  crop_type: string;
  display_name: string;
  lifecycle_stages: ProfileStageOption[];
  cultivars?: ProfileCultivarOption[];
}

export interface DeviceProfileOptionsResponse {
  crops: ProfileCropOption[];
}

/** Higher limit for charts and reports (backend max is 5000). */
export const HISTORY_FETCH_LIMIT = 5000;

export interface PlantEvent {
  id: string;
  device_id: string;
  occurred_at: string;
  created_at: string;
  event_type: string;
  quantity: number | null;
  quantity_unit: string | null;
  note: string | null;
  source: string;
  crop_type_at_event: string | null;
  lifecycle_stage_at_event: string | null;
}

export interface PlantEventCreate {
  device_name?: string;
  occurred_at: string;
  event_type: string;
  quantity?: number | null;
  quantity_unit?: string | null;
  note?: string | null;
  source?: "manual" | "system";
}

export interface PlantEventUpdate {
  occurred_at?: string;
  event_type?: string;
  quantity?: number | null;
  quantity_unit?: string | null;
  note?: string | null;
  clear_quantity?: boolean;
}

export interface PlantEventsListResponse {
  device_name: string;
  events: PlantEvent[];
  count: number;
}

export interface HealthResponse {
  status: string;
  collector_interval_seconds?: number;
}

/** Fallback when /health omits collector_interval_seconds (30 minutes). */
export const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

export function staleAfterMsFromInterval(
  collectorIntervalSeconds: number | null | undefined,
): number {
  if (
    collectorIntervalSeconds == null ||
    !Number.isFinite(collectorIntervalSeconds) ||
    collectorIntervalSeconds < 1
  ) {
    return DEFAULT_STALE_AFTER_MS;
  }
  return collectorIntervalSeconds * 2 * 1000;
}

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertRuleType =
  | "frost_risk"
  | "sustained_out_of_bounds"
  | "approaching_bound"
  | "collector_silence"
  | "irrigation_due"
  | "disease_pressure"
  | "forecast_chill_risk"
  | "tomato_early_blight"
  | "tomato_late_blight"
  | "tomato_powdery_mildew"
  | "tomato_moisture_cracking";

export interface AlertEvent {
  id: string;
  rule_id: string;
  device_id: string;
  opened_at: string;
  closed_at: string | null;
  severity: AlertSeverity;
  metric_key: string | null;
  trigger_value: number | null;
  message: string;
  notified: boolean;
  acknowledged_at: string | null;
  ack_note: string | null;
  rule_type?: AlertRuleType | null;
  rule_notify?: boolean | null;
  rule_enabled?: boolean | null;
}

export interface AlertEventsListResponse {
  device_name: string;
  alerts: AlertEvent[];
  count: number;
}

export interface AlertRule {
  id: string;
  device_id: string | null;
  rule_type: AlertRuleType;
  enabled: boolean;
  notify: boolean;
  params: Record<string, unknown>;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  fired_7d?: number;
  fired_30d?: number;
  last_fired_at?: string | null;
}

export interface AlertRulesListResponse {
  device_name: string;
  rules: AlertRule[];
  count: number;
}

export interface DailyAggregateRow {
  day: string;
  sample_count: number;
  coverage_hours: number;
  moisture_pct_min: number | null;
  moisture_pct_max: number | null;
  moisture_pct_mean: number | null;
  moisture_pct_count: number;
  ph_min: number | null;
  ph_max: number | null;
  ph_mean: number | null;
  ph_count: number;
  soil_temp_c_min: number | null;
  soil_temp_c_max: number | null;
  soil_temp_c_mean: number | null;
  soil_temp_c_count: number;
  ambient_temp_c_min: number | null;
  ambient_temp_c_max: number | null;
  ambient_temp_c_mean: number | null;
  ambient_temp_c_count: number;
  ambient_humidity_pct_min: number | null;
  ambient_humidity_pct_max: number | null;
  ambient_humidity_pct_mean: number | null;
  ambient_humidity_pct_count: number;
  vpd_kpa_mean: number | null;
  vpd_kpa_count: number;
  gdd_day: number | null;
  high_humidity_hours: number;
  incomplete: boolean;
}

export interface DailyAggregatesResponse {
  device_name: string;
  device_id: string;
  timezone: string;
  season_start_date: string | null;
  crop_type: string;
  lifecycle_stage: string;
  cultivar?: string | null;
  gdd_base_c: number;
  from_at: string;
  to_at: string;
  days: DailyAggregateRow[];
  count: number;
  cumulative_gdd: number | null;
  days_elapsed: number | null;
  days_excluded: number;
  cumulative_gdd_unavailable_reason: string | null;
}

export interface AlertEvaluateResponse {
  evaluated_at: string;
  devices: number;
  rules: number;
  evaluated: number;
  opened: number;
  closed: number;
}

export interface DailyAdvisoryDigestResponse {
  device_name: string;
  computed_at: string | null;
  digest: DailyAdvisoryDigestPayload | null;
}

export interface DeviceAdvisoriesDailyRow {
  device_id: string;
  computed_at: string;
  digest: DailyAdvisoryDigestPayload;
}

export interface DailyAdvisoryDigestPayload {
  device_id: string;
  crop_type: string;
  lifecycle_stage: string;
  evaluated_at: string;
  spray_window: {
    found: boolean;
    window_start: string | null;
    window_end: string | null;
    message: string;
  };
  capture_suggestion: {
    suggested_at: string | null;
    cloud_cover: number | null;
    stability_label: string;
    note: string;
  };
  tomato: Record<string, unknown> | null;
}

/** @deprecated Use DailyAdvisoryDigestPayload */
export interface DailyAdvisoryDigestResponseLegacy {
  device_name: string;
  digest: DailyAdvisoryDigestPayload;
}
