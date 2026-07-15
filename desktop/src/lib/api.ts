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
}

export interface LatestReadingResponse {
  device_name: string;
  reading: SensorReading | null;
}

export interface ReadingsRangeResponse {
  device_name: string;
  from_at: string;
  to_at: string;
  readings: SensorReading[];
  count: number;
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
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
): Promise<ReadingsRangeResponse> {
  const params = new URLSearchParams({
    device_name: deviceName,
    from_at: fromAt.toISOString(),
    to_at: toAt.toISOString(),
    limit: "120",
  });
  return apiFetch<ReadingsRangeResponse>(`/readings/range?${params}`);
}

export async function fetchHealth(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health");
}
