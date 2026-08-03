/**
 * Supabase implementation of the shared DataClient seam.
 *
 * Each method mirrors the corresponding FastAPI sidecar route in
 * ml-backend/routes so both apps see identical shapes and semantics. Where
 * the sidecar validates, this client validates with the same messages.
 * evaluateAlerts is deliberately absent: the alert engine runs in the
 * sidecar, so dataClientSupportsEvaluate() reports false here and the
 * Alerts view suppresses its "Evaluate now" control.
 */

import {
  cumulativeGdd,
  CROP_PROFILES,
  DEFAULT_DEVICE_TIMEZONE,
  getGddBaseC,
  getSelectedDeviceName,
  isPlantEventTypeKey,
  type AlertEvent,
  type AlertEventsListResponse,
  type AlertRule,
  type AlertRulePatch,
  type AlertRulesListResponse,
  type AlertsQuery,
  type DailyAggregateRow,
  type DailyAggregatesResponse,
  type DataClient,
  type DeviceProfileOptionsResponse,
  type DeviceProfilePatch,
  type DeviceResponse,
  type EventsQuery,
  type HealthResponse,
  type LatestReadingResponse,
  type PlantEvent,
  type PlantEventCreate,
  type PlantEventUpdate,
  type PlantEventsListResponse,
  type ProfileCropOption,
  type ReadingsRangeResponse,
  type SensorReading,
} from "@dirt-signal/shared";
import { recordSuccessfulFetch } from "./freshness";
import { supabase } from "./supabaseClient";

const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

interface DeviceRecord {
  id: string;
  name: string;
  crop_type: string;
  lifecycle_stage: string;
  timezone: string;
  season_start_date: string | null;
  collector_interval_seconds: number | null;
}

function failed(error: { message: string } | null, context: string): Error {
  return new Error(error?.message ?? context);
}

/** Mirror of ml-backend db._device_from_row normalisation. */
function deviceFromRow(row: Record<string, unknown>): DeviceRecord {
  const tz = typeof row.timezone === "string" ? row.timezone.trim() : "";
  const season = row.season_start_date;
  const intervalRaw = row.collector_interval_seconds;
  let interval: number | null = null;
  if (typeof intervalRaw === "number" && Number.isFinite(intervalRaw)) {
    interval = Math.trunc(intervalRaw);
  }
  if (interval !== null && interval < 1) interval = null;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    crop_type: String(row.crop_type ?? "") || "tomato",
    lifecycle_stage: String(row.lifecycle_stage ?? "") || "mature",
    timezone: tz || DEFAULT_DEVICE_TIMEZONE,
    season_start_date: season ? String(season).slice(0, 10) : null,
    collector_interval_seconds: interval,
  };
}

async function resolveDevice(deviceName: string): Promise<DeviceRecord> {
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .eq("name", deviceName)
    .limit(1);
  if (error) throw failed(error, "Failed to load device");
  const row = (data ?? [])[0];
  if (!row) throw new Error(`No device named '${deviceName}' found`);
  return deviceFromRow(row);
}

async function resolveDeviceById(deviceId: string): Promise<DeviceRecord> {
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .eq("id", deviceId)
    .limit(1);
  if (error) throw failed(error, "Failed to load device");
  const row = (data ?? [])[0];
  if (!row) throw new Error(`No device with id '${deviceId}' found`);
  return deviceFromRow(row);
}

function deviceProfileFields(device: DeviceRecord) {
  return {
    crop_type: device.crop_type,
    lifecycle_stage: device.lifecycle_stage,
    device_id: device.id,
    timezone: device.timezone,
    season_start_date: device.season_start_date,
  };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

function assertRange(fromAt: Date, toAt: Date): void {
  if (fromAt.getTime() >= toAt.getTime()) {
    throw new Error("from_at must be before to_at");
  }
}

function validateEventType(eventType: string): string {
  if (!isPlantEventTypeKey(eventType)) {
    throw new Error(`Unknown event_type '${eventType}'.`);
  }
  return eventType;
}

function validateOccurredAt(occurredAt: string): string {
  const at = new Date(occurredAt);
  if (Number.isNaN(at.getTime())) {
    throw new Error("Invalid occurred_at");
  }
  if (at.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
    throw new Error(
      "occurred_at must not be more than 24 hours in the future " +
        "(check timezone and date picker).",
    );
  }
  return at.toISOString();
}

function validateQuantity(quantity: number | null | undefined): number | null {
  if (quantity == null) return null;
  if (quantity < 0) {
    throw new Error("quantity must be null or non-negative");
  }
  return quantity;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict calendar-date check mirroring Python date.fromisoformat. */
function isRealCalendarDate(raw: string): boolean {
  const [y, m, d] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function int(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

// ---------------------------------------------------------------------------
// Alert enrichment (mirror of routes/alerts._parse_alert + _rules_by_id)
// ---------------------------------------------------------------------------

async function rulesById(): Promise<Map<string, Record<string, unknown>>> {
  const { data, error } = await supabase.from("alert_rules").select("*");
  if (error) throw failed(error, "Failed to load alert rules");
  return new Map(
    (data ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
  );
}

function enrichAlert(
  row: Record<string, unknown>,
  rule: Record<string, unknown> | undefined,
): AlertEvent {
  const payload = { ...row } as unknown as AlertEvent;
  if (rule) {
    payload.rule_type = (rule.rule_type ?? null) as AlertEvent["rule_type"];
    payload.rule_notify = (rule.notify ?? null) as boolean | null;
    payload.rule_enabled = (rule.enabled ?? null) as boolean | null;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Client methods
// ---------------------------------------------------------------------------

async function fetchHealth(): Promise<HealthResponse> {
  const device = await resolveDevice(getSelectedDeviceName());
  return {
    status: "ok",
    collector_interval_seconds: device.collector_interval_seconds ?? 30,
  };
}

async function fetchLatestReading(
  deviceName = getSelectedDeviceName(),
): Promise<LatestReadingResponse> {
  const device = await resolveDevice(deviceName);
  const { data, error } = await supabase
    .from("sensor_readings")
    .select("*")
    .eq("device_id", device.id)
    .order("recorded_at", { ascending: false })
    .limit(1);
  if (error) throw failed(error, "Failed to load latest reading");
  const reading = ((data ?? [])[0] as SensorReading | undefined) ?? null;
  return {
    device_name: deviceName,
    reading,
    ...deviceProfileFields(device),
  };
}

async function fetchReadingsRange(
  fromAt: Date,
  toAt: Date,
  deviceName = getSelectedDeviceName(),
  limit = 120,
): Promise<ReadingsRangeResponse> {
  assertRange(fromAt, toAt);
  const device = await resolveDevice(deviceName);
  const { data, error } = await supabase
    .from("sensor_readings")
    .select("*")
    .eq("device_id", device.id)
    .gte("recorded_at", fromAt.toISOString())
    .lte("recorded_at", toAt.toISOString())
    .order("recorded_at", { ascending: true })
    .limit(clamp(limit, 1, 5000));
  if (error) throw failed(error, "Failed to load readings range");
  const readings = (data ?? []) as SensorReading[];
  return {
    device_name: deviceName,
    from_at: fromAt.toISOString(),
    to_at: toAt.toISOString(),
    readings,
    count: readings.length,
    ...deviceProfileFields(device),
  };
}

async function fetchDailyAggregates(
  fromAt: Date,
  toAt: Date,
  deviceName = getSelectedDeviceName(),
): Promise<DailyAggregatesResponse> {
  assertRange(fromAt, toAt);
  const device = await resolveDevice(deviceName);
  const gddBase = getGddBaseC(device.crop_type);
  const { data, error } = await supabase.rpc("device_daily_aggregates", {
    p_device_id: device.id,
    p_from_at: fromAt.toISOString(),
    p_to_at: toAt.toISOString(),
    p_humidity_threshold: 85,
    p_gdd_base_c: gddBase,
  });
  if (error) throw failed(error, "Failed to load daily aggregates");

  const days: DailyAggregateRow[] = ((data ?? []) as Record<string, unknown>[]).map(
    (row) => ({
      day: row.day == null ? "" : String(row.day).slice(0, 10),
      sample_count: int(row.sample_count),
      coverage_hours: int(row.coverage_hours),
      moisture_pct_min: num(row.moisture_pct_min),
      moisture_pct_max: num(row.moisture_pct_max),
      moisture_pct_mean: num(row.moisture_pct_mean),
      moisture_pct_count: int(row.moisture_pct_count),
      ph_min: num(row.ph_min),
      ph_max: num(row.ph_max),
      ph_mean: num(row.ph_mean),
      ph_count: int(row.ph_count),
      soil_temp_c_min: num(row.soil_temp_c_min),
      soil_temp_c_max: num(row.soil_temp_c_max),
      soil_temp_c_mean: num(row.soil_temp_c_mean),
      soil_temp_c_count: int(row.soil_temp_c_count),
      ambient_temp_c_min: num(row.ambient_temp_c_min),
      ambient_temp_c_max: num(row.ambient_temp_c_max),
      ambient_temp_c_mean: num(row.ambient_temp_c_mean),
      ambient_temp_c_count: int(row.ambient_temp_c_count),
      ambient_humidity_pct_min: num(row.ambient_humidity_pct_min),
      ambient_humidity_pct_max: num(row.ambient_humidity_pct_max),
      ambient_humidity_pct_mean: num(row.ambient_humidity_pct_mean),
      ambient_humidity_pct_count: int(row.ambient_humidity_pct_count),
      vpd_kpa_mean: num(row.vpd_kpa_mean),
      vpd_kpa_count: int(row.vpd_kpa_count),
      gdd_day: num(row.gdd_day),
      high_humidity_hours: int(row.high_humidity_hours),
      incomplete: Boolean(row.incomplete),
    }),
  );

  const cum = cumulativeGdd(
    days.map((d) => ({
      day: d.day,
      gdd_day: d.gdd_day,
      incomplete: d.incomplete,
    })),
    device.season_start_date,
  );

  return {
    device_name: deviceName,
    device_id: device.id,
    timezone: device.timezone,
    season_start_date: device.season_start_date,
    crop_type: device.crop_type,
    lifecycle_stage: device.lifecycle_stage,
    gdd_base_c: gddBase,
    from_at: fromAt.toISOString(),
    to_at: toAt.toISOString(),
    days,
    count: days.length,
    cumulative_gdd: cum.cumulative_gdd,
    days_elapsed: cum.days_elapsed,
    days_excluded: cum.days_excluded,
    cumulative_gdd_unavailable_reason: cum.unavailable_reason,
  };
}

/** Mirror of routes/devices._stage_display_name (Python str.capitalize). */
function stageDisplayName(stageKey: string): string {
  const spaced = stageKey.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

async function fetchProfileOptions(
  deviceId: string,
): Promise<DeviceProfileOptionsResponse> {
  await resolveDeviceById(deviceId);
  const crops: ProfileCropOption[] = Object.entries(CROP_PROFILES).map(
    ([cropType, crop]) => ({
      crop_type: cropType,
      display_name: crop.display_name ?? cropType,
      lifecycle_stages: Object.keys(crop.stages).map((stageKey) => ({
        lifecycle_stage: stageKey,
        display_name: stageDisplayName(stageKey),
      })),
    }),
  );
  return { crops };
}

/** Best-effort system event mirroring routes/devices._insert_stage_change_event. */
async function insertStageChangeEvent(
  deviceId: string,
  oldCrop: string,
  oldStage: string,
  newCrop: string,
  newStage: string,
): Promise<void> {
  if (oldCrop === newCrop && oldStage === newStage) return;
  const note = `${oldCrop}/${oldStage} → ${newCrop}/${newStage}`;
  const { error } = await supabase.from("plant_events").insert({
    device_id: deviceId,
    occurred_at: new Date().toISOString(),
    event_type: "stage_change",
    quantity: null,
    quantity_unit: null,
    note,
    source: "system",
    crop_type_at_event: newCrop,
    lifecycle_stage_at_event: newStage,
  });
  if (error) {
    // Profile update already succeeded; the marker is best-effort.
    console.error(
      `Failed to insert stage_change event for device ${deviceId} (${note}):`,
      error.message,
    );
  }
}

async function patchDeviceProfile(
  deviceId: string,
  body: DeviceProfilePatch,
): Promise<DeviceResponse> {
  const existing = await resolveDeviceById(deviceId);

  const patch: Record<string, unknown> = {};
  const newCrop = body.crop_type ?? existing.crop_type;
  const newStage = body.lifecycle_stage ?? existing.lifecycle_stage;

  if (body.crop_type !== undefined || body.lifecycle_stage !== undefined) {
    const crop = CROP_PROFILES[newCrop];
    if (!crop) {
      const valid = Object.keys(CROP_PROFILES).sort().join(", ");
      throw new Error(
        `Unknown crop_type '${newCrop}'. Valid values: ${valid}.`,
      );
    }
    if (!crop.stages[newStage]) {
      const valid = Object.keys(crop.stages).sort().join(", ") || "(none)";
      throw new Error(
        `Unknown lifecycle_stage '${newStage}' for crop_type ` +
          `'${newCrop}'. Valid values: ${valid}.`,
      );
    }
    patch.crop_type = newCrop;
    patch.lifecycle_stage = newStage;
  }

  if (body.clear_season_start) {
    patch.season_start_date = null;
  } else if (body.season_start_date != null) {
    const raw = body.season_start_date.trim();
    if (!DATE_RE.test(raw)) {
      throw new Error("season_start_date must be YYYY-MM-DD");
    }
    if (!isRealCalendarDate(raw)) {
      throw new Error("season_start_date must be a valid calendar date");
    }
    patch.season_start_date = raw;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No fields to update");
  }

  const { data, error } = await supabase
    .from("devices")
    .update(patch)
    .eq("id", deviceId)
    .select();
  if (error) throw failed(error, "Failed to update device profile");
  const updated = (data ?? [])[0];
  if (!updated) throw new Error("Failed to update device profile");

  const device = deviceFromRow(updated);
  if ("crop_type" in patch || "lifecycle_stage" in patch) {
    await insertStageChangeEvent(
      deviceId,
      existing.crop_type,
      existing.lifecycle_stage,
      device.crop_type,
      device.lifecycle_stage,
    );
  }

  return {
    id: device.id,
    name: device.name,
    crop_type: device.crop_type,
    lifecycle_stage: device.lifecycle_stage,
    timezone: device.timezone,
    season_start_date: device.season_start_date,
  };
}

async function fetchEvents(
  options: EventsQuery,
): Promise<PlantEventsListResponse> {
  const deviceName = options.deviceName ?? getSelectedDeviceName();
  const device = await resolveDevice(deviceName);
  if (options.fromAt && options.toAt) assertRange(options.fromAt, options.toAt);
  const types = (options.types ?? []).filter((t) => t.trim());
  for (const t of types) validateEventType(t);

  let query = supabase
    .from("plant_events")
    .select("*")
    .eq("device_id", device.id)
    .order("occurred_at", { ascending: false })
    .limit(clamp(options.limit ?? 200, 1, 2000));
  if (options.fromAt) query = query.gte("occurred_at", options.fromAt.toISOString());
  if (options.toAt) query = query.lte("occurred_at", options.toAt.toISOString());
  if (types.length > 0) query = query.in("event_type", types);

  const { data, error } = await query;
  if (error) throw failed(error, "Failed to load events");
  const events = (data ?? []) as PlantEvent[];
  return { device_name: deviceName, events, count: events.length };
}

async function createEvent(body: PlantEventCreate): Promise<PlantEvent> {
  const eventType = validateEventType(body.event_type);
  const occurredAt = validateOccurredAt(body.occurred_at);
  const quantity = validateQuantity(body.quantity);
  const device = await resolveDevice(
    body.device_name ?? getSelectedDeviceName(),
  );

  // Creation is always manual, mirroring POST /events. System rows (e.g.
  // stage_change) are inserted by the profile patch, not through here.
  const { data, error } = await supabase
    .from("plant_events")
    .insert({
      device_id: device.id,
      occurred_at: occurredAt,
      event_type: eventType,
      quantity,
      quantity_unit: body.quantity_unit ?? null,
      note: body.note ?? null,
      source: "manual",
      crop_type_at_event: device.crop_type,
      lifecycle_stage_at_event: device.lifecycle_stage,
    })
    .select();
  if (error) throw failed(error, "Failed to insert event");
  const inserted = (data ?? [])[0];
  if (!inserted) throw new Error("Failed to insert event");
  return inserted as PlantEvent;
}

async function updateEvent(
  eventId: string,
  body: PlantEventUpdate,
): Promise<PlantEvent> {
  const patch: Record<string, unknown> = {};

  if (body.occurred_at !== undefined) {
    patch.occurred_at = validateOccurredAt(body.occurred_at);
  }
  if (body.event_type !== undefined) {
    patch.event_type = validateEventType(body.event_type);
  }
  if (body.clear_quantity) {
    patch.quantity = null;
    patch.quantity_unit = null;
  } else if (body.quantity != null) {
    patch.quantity = validateQuantity(body.quantity);
    if (body.quantity_unit != null) {
      patch.quantity_unit = body.quantity_unit;
    }
  } else if (body.quantity_unit != null) {
    patch.quantity_unit = body.quantity_unit;
  }
  if (body.note !== undefined) {
    patch.note = body.note;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No fields to update");
  }

  const { data, error } = await supabase
    .from("plant_events")
    .update(patch)
    .eq("id", eventId)
    .select();
  if (error) throw failed(error, "Failed to update event");
  const updated = (data ?? [])[0];
  if (!updated) throw new Error("Event not found");
  return updated as PlantEvent;
}

async function deleteEvent(eventId: string): Promise<void> {
  const existing = await supabase
    .from("plant_events")
    .select("id")
    .eq("id", eventId)
    .limit(1);
  if (existing.error) throw failed(existing.error, "Failed to load event");
  if ((existing.data ?? []).length === 0) {
    throw new Error("Event not found");
  }
  const { error } = await supabase
    .from("plant_events")
    .delete()
    .eq("id", eventId);
  if (error) throw failed(error, "Failed to delete event");
}

async function fetchAlerts(
  options: AlertsQuery,
): Promise<AlertEventsListResponse> {
  const deviceName = options.deviceName ?? getSelectedDeviceName();
  const device = await resolveDevice(deviceName);
  if (options.fromAt && options.toAt) assertRange(options.fromAt, options.toAt);

  let query = supabase
    .from("alert_events")
    .select("*")
    .eq("device_id", device.id)
    .order("opened_at", { ascending: false })
    .limit(clamp(options.limit ?? 200, 1, 2000));
  if ((options.status ?? "open") === "open") {
    query = query.is("closed_at", null);
  }
  if (options.fromAt) query = query.gte("opened_at", options.fromAt.toISOString());
  if (options.toAt) query = query.lte("opened_at", options.toAt.toISOString());

  const [{ data, error }, rules] = await Promise.all([query, rulesById()]);
  if (error) throw failed(error, "Failed to load alerts");
  const alerts = ((data ?? []) as Record<string, unknown>[]).map((row) =>
    enrichAlert(row, rules.get(String(row.rule_id))),
  );
  return { device_name: deviceName, alerts, count: alerts.length };
}

async function acknowledgeAlert(
  alertId: string,
  note?: string | null,
): Promise<AlertEvent> {
  const { data, error } = await supabase
    .from("alert_events")
    .update({
      acknowledged_at: new Date().toISOString(),
      ack_note: note ?? null,
    })
    .eq("id", alertId)
    .select();
  if (error) throw failed(error, "Failed to acknowledge alert");
  const updated = (data ?? [])[0];
  if (!updated) throw new Error("Alert not found");
  const rules = await rulesById();
  return enrichAlert(
    updated as Record<string, unknown>,
    rules.get(String((updated as Record<string, unknown>).rule_id)),
  );
}

async function markAlertNotified(alertId: string): Promise<AlertEvent> {
  const { data, error } = await supabase
    .from("alert_events")
    .update({ notified: true })
    .eq("id", alertId)
    .select();
  if (error) throw failed(error, "Failed to mark alert notified");
  const updated = (data ?? [])[0];
  if (!updated) throw new Error("Alert not found");
  const rules = await rulesById();
  return enrichAlert(
    updated as Record<string, unknown>,
    rules.get(String((updated as Record<string, unknown>).rule_id)),
  );
}

async function fetchAlertRules(
  deviceName = getSelectedDeviceName(),
): Promise<AlertRulesListResponse> {
  const device = await resolveDevice(deviceName);
  const { data, error } = await supabase.from("alert_rules").select("*");
  if (error) throw failed(error, "Failed to load alert rules");

  const filtered = ((data ?? []) as Record<string, unknown>[])
    .filter(
      (row) => row.device_id == null || String(row.device_id) === device.id,
    )
    .sort((a, b) =>
      String(a.rule_type ?? "").localeCompare(String(b.rule_type ?? "")),
    );

  const now = Date.now();
  const from7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const from30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const eventsRes = await supabase
    .from("alert_events")
    .select("rule_id, opened_at")
    .eq("device_id", device.id)
    .gte("opened_at", from30d);
  if (eventsRes.error) {
    throw failed(eventsRes.error, "Failed to load alert firing counts");
  }

  const counts = new Map<
    string,
    { fired_7d: number; fired_30d: number; last_fired_at: string | null }
  >();
  for (const ev of eventsRes.data ?? []) {
    const rid = String(ev.rule_id);
    const opened = ev.opened_at ? String(ev.opened_at) : null;
    const bucket = counts.get(rid) ?? {
      fired_7d: 0,
      fired_30d: 0,
      last_fired_at: null,
    };
    bucket.fired_30d += 1;
    if (opened && opened >= from7d) bucket.fired_7d += 1;
    if (opened && (bucket.last_fired_at === null || opened > bucket.last_fired_at)) {
      bucket.last_fired_at = opened;
    }
    counts.set(rid, bucket);
  }

  const rules = filtered.map((row) => {
    const stats = counts.get(String(row.id));
    return {
      ...(row as unknown as AlertRule),
      fired_7d: stats?.fired_7d ?? 0,
      fired_30d: stats?.fired_30d ?? 0,
      last_fired_at: stats?.last_fired_at ?? null,
    };
  });
  return { device_name: deviceName, rules, count: rules.length };
}

async function patchAlertRule(
  ruleId: string,
  body: AlertRulePatch,
): Promise<AlertRule> {
  const patch: Record<string, unknown> = {};
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.notify !== undefined) patch.notify = body.notify;
  // params passes through unchanged; note the RLS column grants from
  // migration 009 do not include params (no view edits it), so a params
  // patch will be rejected by the database rather than silently dropped.
  if (body.params !== undefined) patch.params = body.params;
  if (body.clear_snooze) {
    patch.snoozed_until = null;
  } else if (body.snoozed_until !== undefined) {
    patch.snoozed_until = body.snoozed_until;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("No fields to update");
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("alert_rules")
    .update(patch)
    .eq("id", ruleId)
    .select();
  if (error) throw failed(error, "Failed to update alert rule");
  const updated = (data ?? [])[0];
  if (!updated) throw new Error("Alert rule not found");
  return updated as unknown as AlertRule;
}

// ---------------------------------------------------------------------------
// Freshness tracking wrapper
// ---------------------------------------------------------------------------

function tracked<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    const result = await fn(...args);
    recordSuccessfulFetch();
    return result;
  };
}

/**
 * Supabase-backed data client. evaluateAlerts is intentionally omitted so
 * dataClientSupportsEvaluate() reports false.
 */
export const supabaseDataClient: DataClient = {
  sourceLabel: "Supabase",
  fetchHealth: tracked(fetchHealth),
  fetchLatestReading: tracked(fetchLatestReading),
  fetchReadingsRange: tracked(fetchReadingsRange),
  fetchDailyAggregates: tracked(fetchDailyAggregates),
  fetchProfileOptions: tracked(fetchProfileOptions),
  patchDeviceProfile: tracked(patchDeviceProfile),
  fetchEvents: tracked(fetchEvents),
  createEvent: tracked(createEvent),
  updateEvent: tracked(updateEvent),
  deleteEvent: tracked(deleteEvent),
  fetchAlerts: tracked(fetchAlerts),
  acknowledgeAlert: tracked(acknowledgeAlert),
  markAlertNotified: tracked(markAlertNotified),
  fetchAlertRules: tracked(fetchAlertRules),
  patchAlertRule: tracked(patchAlertRule),
};
