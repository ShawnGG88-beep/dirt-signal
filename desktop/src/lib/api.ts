/**
 * Sidecar data client: typed fetch wrapper for the local FastAPI sidecar.
 * Response and request types live in @dirt-signal/shared so the web app's
 * Supabase client can return the same shapes.
 */

import type {
  AlertEvaluateResponse,
  DataClient,
  AlertEvent,
  AlertEventsListResponse,
  AlertRule,
  AlertRulesListResponse,
  DailyAggregatesResponse,
  DailyAdvisoryDigestResponse,
  DailyAdvisoryDigestResponseLegacy,
  DeviceProfileOptionsResponse,
  DeviceResponse,
  HealthResponse,
  LatestReadingResponse,
  PlantEvent,
  PlantEventCreate,
  PlantEventUpdate,
  PlantEventsListResponse,
  ReadingsRangeResponse,
} from "@dirt-signal/shared";

// Re-export so desktop-internal imports of "../lib/api" keep working.
export type {
  AlertEvaluateResponse,
  AlertEvent,
  AlertEventsListResponse,
  AlertRule,
  AlertRuleType,
  AlertRulesListResponse,
  AlertSeverity,
  DailyAggregateRow,
  DailyAggregatesResponse,
  DeviceProfileOptionsResponse,
  DeviceResponse,
  HealthResponse,
  LatestReadingResponse,
  PlantEvent,
  PlantEventCreate,
  PlantEventUpdate,
  PlantEventsListResponse,
  ProfileCropOption,
  ProfileStageOption,
  ReadingsRangeResponse,
  SensorReading,
} from "@dirt-signal/shared";
export {
  DEFAULT_STALE_AFTER_MS,
  HISTORY_FETCH_LIMIT,
  staleAfterMsFromInterval,
} from "@dirt-signal/shared";

const API_BASE = "http://127.0.0.1:8731";

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

export async function fetchProfileOptions(
  deviceId: string,
): Promise<DeviceProfileOptionsResponse> {
  return apiFetch<DeviceProfileOptionsResponse>(
    `/devices/${encodeURIComponent(deviceId)}/profile-options`,
  );
}

export async function patchDeviceProfile(
  deviceId: string,
  body: {
    crop_type?: string;
    lifecycle_stage?: string;
    season_start_date?: string | null;
    clear_season_start?: boolean;
    soil_texture?: string | null;
    cultivar?: string | null;
    soil_field_capacity_raw?: number | null;
    soil_refill_point_raw?: number | null;
  },
): Promise<DeviceResponse> {
  return apiFetch<DeviceResponse>(
    `/devices/${encodeURIComponent(deviceId)}/profile`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
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

export async function fetchDailyAggregates(
  fromAt: Date,
  toAt: Date,
  deviceName = "pi-garden-01",
): Promise<DailyAggregatesResponse> {
  const params = new URLSearchParams({
    device_name: deviceName,
    from_at: fromAt.toISOString(),
    to_at: toAt.toISOString(),
  });
  return apiFetch<DailyAggregatesResponse>(
    `/readings/daily-aggregates?${params}`,
  );
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

export async function fetchLatestAdvisoryDigest(
  deviceName = "pi-garden-01",
): Promise<DailyAdvisoryDigestResponse> {
  return apiFetch<DailyAdvisoryDigestResponse>(
    `/advisories/latest?device_name=${encodeURIComponent(deviceName)}`,
  );
}

export async function fetchDailyAdvisories(
  deviceName = "pi-garden-01",
): Promise<DailyAdvisoryDigestResponseLegacy> {
  const result = await apiFetch<{
    device_name: string;
    digest: DailyAdvisoryDigestResponseLegacy["digest"];
  }>(`/advisories/daily?device_name=${encodeURIComponent(deviceName)}`);
  return {
    device_name: result.device_name,
    digest: result.digest,
  };
}

/** Sidecar implementation of the shared data-client seam. */
export const sidecarDataClient: DataClient = {
  sourceLabel: "sidecar (127.0.0.1:8731)",
  fetchHealth,
  fetchLatestReading,
  fetchReadingsRange,
  fetchDailyAggregates,
  fetchProfileOptions,
  patchDeviceProfile,
  fetchEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  fetchAlerts,
  acknowledgeAlert,
  markAlertNotified,
  fetchAlertRules,
  patchAlertRule,
  evaluateAlerts,
  fetchLatestAdvisoryDigest,
  fetchDailyAdvisories,
};
