const API_BASE = "http://127.0.0.1:8731";

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
}

export interface DeviceResponse {
  id: string;
  name: string;
  crop_type: string;
  lifecycle_stage: string;
}

export interface ProfileStageOption {
  lifecycle_stage: string;
  display_name: string;
}

export interface ProfileCropOption {
  crop_type: string;
  display_name: string;
  lifecycle_stages: ProfileStageOption[];
}

export interface DeviceProfileOptionsResponse {
  crops: ProfileCropOption[];
}

async function readApiError(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      return parsed.detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return JSON.stringify(item);
        })
        .join("; ");
    }
  } catch {
    // fall through to raw body
  }
  return raw || response.statusText;
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export async function fetchLatestReading(
  deviceName = "pi-garden-01",
): Promise<LatestReadingResponse> {
  return apiFetch<LatestReadingResponse>(
    `/readings/latest?device_name=${encodeURIComponent(deviceName)}`,
  );
}

export async function fetchReadingsRange(
  fromAt: Date,
  toAt: Date,
  deviceName = "pi-garden-01",
  /** Dashboard keeps the original 120; history/reports may request more. */
  limit = 120,
): Promise<ReadingsRangeResponse> {
  const params = new URLSearchParams({
    device_name: deviceName,
    from_at: fromAt.toISOString(),
    to_at: toAt.toISOString(),
    limit: String(Math.min(Math.max(limit, 1), 5000)),
  });
  return apiFetch<ReadingsRangeResponse>(`/readings/range?${params}`);
}

/** Higher limit for charts and reports (backend max is 5000). */
export const HISTORY_FETCH_LIMIT = 5000;

export async function fetchProfileOptions(
  deviceId: string,
): Promise<DeviceProfileOptionsResponse> {
  return apiFetch<DeviceProfileOptionsResponse>(
    `/devices/${encodeURIComponent(deviceId)}/profile-options`,
  );
}

export async function patchDeviceProfile(
  deviceId: string,
  cropType: string,
  lifecycleStage: string,
): Promise<DeviceResponse> {
  return apiFetch<DeviceResponse>(
    `/devices/${encodeURIComponent(deviceId)}/profile`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crop_type: cropType,
        lifecycle_stage: lifecycleStage,
      }),
    },
  );
}

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

export async function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}

export async function fetchEvents(options: {
  deviceName?: string;
  fromAt?: Date;
  toAt?: Date;
  types?: string[];
  limit?: number;
}): Promise<PlantEventsListResponse> {
  const params = new URLSearchParams({
    device_name: options.deviceName ?? "pi-garden-01",
    limit: String(Math.min(Math.max(options.limit ?? 200, 1), 2000)),
  });
  if (options.fromAt) params.set("from_at", options.fromAt.toISOString());
  if (options.toAt) params.set("to_at", options.toAt.toISOString());
  if (options.types && options.types.length > 0) {
    params.set("types", options.types.join(","));
  }
  return apiFetch<PlantEventsListResponse>(`/events?${params}`);
}

export async function createEvent(
  body: PlantEventCreate,
): Promise<PlantEvent> {
  const response = await apiFetch<{ event: PlantEvent }>("/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_name: body.device_name ?? "pi-garden-01",
      occurred_at: body.occurred_at,
      event_type: body.event_type,
      quantity: body.quantity ?? null,
      quantity_unit: body.quantity_unit ?? null,
      note: body.note ?? null,
      source: body.source ?? "manual",
    }),
  });
  return response.event;
}

export async function updateEvent(
  eventId: string,
  body: PlantEventUpdate,
): Promise<PlantEvent> {
  const response = await apiFetch<{ event: PlantEvent }>(
    `/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return response.event;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail);
  }
}

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertRuleType =
  | "frost_risk"
  | "sustained_out_of_bounds"
  | "approaching_bound"
  | "collector_silence"
  | "irrigation_due"
  | "disease_pressure";

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
}

export interface AlertRulesListResponse {
  device_name: string;
  rules: AlertRule[];
  count: number;
}

export interface AlertEvaluateResponse {
  evaluated_at: string;
  devices: number;
  rules: number;
  evaluated: number;
  opened: number;
  closed: number;
}

export async function fetchAlerts(options: {
  deviceName?: string;
  status?: "open" | "all";
  fromAt?: Date;
  toAt?: Date;
  limit?: number;
}): Promise<AlertEventsListResponse> {
  const params = new URLSearchParams({
    device_name: options.deviceName ?? "pi-garden-01",
    status: options.status ?? "open",
    limit: String(Math.min(Math.max(options.limit ?? 200, 1), 2000)),
  });
  if (options.fromAt) params.set("from_at", options.fromAt.toISOString());
  if (options.toAt) params.set("to_at", options.toAt.toISOString());
  return apiFetch<AlertEventsListResponse>(`/alerts?${params}`);
}

export async function acknowledgeAlert(
  alertId: string,
  note?: string | null,
): Promise<AlertEvent> {
  const response = await apiFetch<{ alert: AlertEvent }>(
    `/alerts/${encodeURIComponent(alertId)}/acknowledge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note ?? null }),
    },
  );
  return response.alert;
}

export async function markAlertNotified(alertId: string): Promise<AlertEvent> {
  const response = await apiFetch<{ alert: AlertEvent }>(
    `/alerts/${encodeURIComponent(alertId)}/mark-notified`,
    { method: "POST" },
  );
  return response.alert;
}

export async function fetchAlertRules(
  deviceName = "pi-garden-01",
): Promise<AlertRulesListResponse> {
  return apiFetch<AlertRulesListResponse>(
    `/alert-rules?device_name=${encodeURIComponent(deviceName)}`,
  );
}

export async function patchAlertRule(
  ruleId: string,
  body: {
    enabled?: boolean;
    notify?: boolean;
    params?: Record<string, unknown>;
    snoozed_until?: string | null;
    clear_snooze?: boolean;
  },
): Promise<AlertRule> {
  const response = await apiFetch<{ rule: AlertRule }>(
    `/alert-rules/${encodeURIComponent(ruleId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return response.rule;
}

export async function evaluateAlerts(): Promise<AlertEvaluateResponse> {
  return apiFetch<AlertEvaluateResponse>("/alerts/evaluate", {
    method: "POST",
  });
}
