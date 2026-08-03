/**
 * Narrow data-client seam between the shared views and a concrete data
 * source. Desktop registers the sidecar HTTP client; web registers a
 * supabase-js client returning the same shapes (see ./types).
 *
 * The delegating functions mirror the original desktop api.ts exports
 * name-for-name so view and component code is unchanged by the extraction
 * beyond import paths.
 */

import type {
  AlertEvaluateResponse,
  AlertEvent,
  AlertEventsListResponse,
  AlertRule,
  AlertRulesListResponse,
  DailyAggregatesResponse,
  DeviceProfileOptionsResponse,
  DeviceResponse,
  HealthResponse,
  LatestReadingResponse,
  PlantEvent,
  PlantEventCreate,
  PlantEventUpdate,
  PlantEventsListResponse,
  ReadingsRangeResponse,
} from "./types";

export interface EventsQuery {
  deviceName?: string;
  fromAt?: Date;
  toAt?: Date;
  types?: string[];
  limit?: number;
}

export interface AlertsQuery {
  deviceName?: string;
  status?: "open" | "all";
  fromAt?: Date;
  toAt?: Date;
  limit?: number;
}

export interface DeviceProfilePatch {
  crop_type?: string;
  lifecycle_stage?: string;
  season_start_date?: string | null;
  clear_season_start?: boolean;
}

export interface AlertRulePatch {
  enabled?: boolean;
  notify?: boolean;
  params?: Record<string, unknown>;
  snoozed_until?: string | null;
  clear_snooze?: boolean;
}

export interface DataClient {
  /** Short human label for the data source, e.g. "sidecar (127.0.0.1:8731)". */
  readonly sourceLabel?: string;
  fetchHealth(): Promise<HealthResponse>;
  fetchLatestReading(deviceName?: string): Promise<LatestReadingResponse>;
  fetchReadingsRange(
    fromAt: Date,
    toAt: Date,
    deviceName?: string,
    limit?: number,
  ): Promise<ReadingsRangeResponse>;
  fetchDailyAggregates(
    fromAt: Date,
    toAt: Date,
    deviceName?: string,
  ): Promise<DailyAggregatesResponse>;
  fetchProfileOptions(deviceId: string): Promise<DeviceProfileOptionsResponse>;
  patchDeviceProfile(
    deviceId: string,
    body: DeviceProfilePatch,
  ): Promise<DeviceResponse>;
  fetchEvents(options: EventsQuery): Promise<PlantEventsListResponse>;
  createEvent(body: PlantEventCreate): Promise<PlantEvent>;
  updateEvent(eventId: string, body: PlantEventUpdate): Promise<PlantEvent>;
  deleteEvent(eventId: string): Promise<void>;
  fetchAlerts(options: AlertsQuery): Promise<AlertEventsListResponse>;
  acknowledgeAlert(
    alertId: string,
    note?: string | null,
  ): Promise<AlertEvent>;
  markAlertNotified(alertId: string): Promise<AlertEvent>;
  fetchAlertRules(deviceName?: string): Promise<AlertRulesListResponse>;
  patchAlertRule(ruleId: string, body: AlertRulePatch): Promise<AlertRule>;
  /**
   * Optional: only data sources that can trigger an evaluation pass provide
   * it (the sidecar can; the web Supabase client cannot, because the alert
   * engine runs in the sidecar).
   */
  evaluateAlerts?(): Promise<AlertEvaluateResponse>;
}

let activeClient: DataClient | null = null;

/** Register the app's data source once at startup, before first render. */
export function setDataClient(client: DataClient): void {
  activeClient = client;
}

export function getDataClient(): DataClient {
  if (!activeClient) {
    throw new Error(
      "No data client registered. Call setDataClient() at startup.",
    );
  }
  return activeClient;
}

/** Whether the registered data source can trigger an evaluation pass. */
export function dataClientSupportsEvaluate(): boolean {
  return typeof getDataClient().evaluateAlerts === "function";
}

/** Human label for status copy; safe before registration. */
export function getDataSourceLabel(): string {
  return activeClient?.sourceLabel ?? "data source";
}

// ---------------------------------------------------------------------------
// Delegators mirroring the original desktop api.ts function surface
// ---------------------------------------------------------------------------

export function fetchHealth(): Promise<HealthResponse> {
  return getDataClient().fetchHealth();
}

export function fetchLatestReading(
  deviceName?: string,
): Promise<LatestReadingResponse> {
  return getDataClient().fetchLatestReading(deviceName);
}

export function fetchReadingsRange(
  fromAt: Date,
  toAt: Date,
  deviceName?: string,
  limit?: number,
): Promise<ReadingsRangeResponse> {
  return getDataClient().fetchReadingsRange(fromAt, toAt, deviceName, limit);
}

export function fetchDailyAggregates(
  fromAt: Date,
  toAt: Date,
  deviceName?: string,
): Promise<DailyAggregatesResponse> {
  return getDataClient().fetchDailyAggregates(fromAt, toAt, deviceName);
}

export function fetchProfileOptions(
  deviceId: string,
): Promise<DeviceProfileOptionsResponse> {
  return getDataClient().fetchProfileOptions(deviceId);
}

export function patchDeviceProfile(
  deviceId: string,
  body: DeviceProfilePatch,
): Promise<DeviceResponse> {
  return getDataClient().patchDeviceProfile(deviceId, body);
}

export function fetchEvents(
  options: EventsQuery,
): Promise<PlantEventsListResponse> {
  return getDataClient().fetchEvents(options);
}

export function createEvent(body: PlantEventCreate): Promise<PlantEvent> {
  return getDataClient().createEvent(body);
}

export function updateEvent(
  eventId: string,
  body: PlantEventUpdate,
): Promise<PlantEvent> {
  return getDataClient().updateEvent(eventId, body);
}

export function deleteEvent(eventId: string): Promise<void> {
  return getDataClient().deleteEvent(eventId);
}

export function fetchAlerts(
  options: AlertsQuery,
): Promise<AlertEventsListResponse> {
  return getDataClient().fetchAlerts(options);
}

export function acknowledgeAlert(
  alertId: string,
  note?: string | null,
): Promise<AlertEvent> {
  return getDataClient().acknowledgeAlert(alertId, note);
}

export function markAlertNotified(alertId: string): Promise<AlertEvent> {
  return getDataClient().markAlertNotified(alertId);
}

export function fetchAlertRules(
  deviceName?: string,
): Promise<AlertRulesListResponse> {
  return getDataClient().fetchAlertRules(deviceName);
}

export function patchAlertRule(
  ruleId: string,
  body: AlertRulePatch,
): Promise<AlertRule> {
  return getDataClient().patchAlertRule(ruleId, body);
}

export function evaluateAlerts(): Promise<AlertEvaluateResponse> {
  const client = getDataClient();
  if (!client.evaluateAlerts) {
    return Promise.reject(
      new Error("Alert evaluation is not supported by this data source."),
    );
  }
  return client.evaluateAlerts();
}
