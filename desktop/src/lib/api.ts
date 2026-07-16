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

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API ${response.status}: ${detail}`);
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

export async function fetchHealth(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health");
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
