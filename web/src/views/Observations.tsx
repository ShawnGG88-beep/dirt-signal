import { useCallback, useEffect, useState } from "react";
import { useSelectedDeviceName } from "@dirt-signal/shared";
import { resolveObservationImageUrl } from "../lib/observationImages";
import { supabase } from "../lib/supabaseClient";

interface ObservationRow {
  id: number;
  device_id: string;
  captured_at: string;
  image_path: string | null;
  ndvi_estimate: number | null;
  health_label: string | null;
  notes: string | null;
  light_condition: string;
}

const LIGHT_LABELS: Record<string, string> = {
  natural: "Natural light",
  grow_light: "Grow light",
  mixed: "Mixed light",
  unknown: "Light unknown",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Plant observations gallery over plant_observations. Images are captured
 * to the Pi's local filesystem and are not yet uploaded to Supabase
 * Storage, so every card currently shows the not-uploaded state; once the
 * collector uploads captures, resolveObservationImageUrl swaps in signed
 * URLs without touching this view's structure.
 */
export function Observations() {
  const deviceName = useSelectedDeviceName();
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deviceRes = await supabase
        .from("devices")
        .select("id")
        .eq("name", deviceName)
        .limit(1);
      if (deviceRes.error) throw new Error(deviceRes.error.message);
      const device = (deviceRes.data ?? [])[0];
      if (!device) throw new Error(`No device named '${deviceName}' found`);

      const { data, error: loadError } = await supabase
        .from("plant_observations")
        .select("*")
        .eq("device_id", String(device.id))
        .order("captured_at", { ascending: false })
        .limit(100);
      if (loadError) throw new Error(loadError.message);
      const rows = (data ?? []) as ObservationRow[];
      setObservations(rows);
      setError(null);

      const urls: Record<number, string> = {};
      for (const row of rows) {
        const url = await resolveObservationImageUrl(row);
        if (url) urls[row.id] = url;
      }
      setImageUrls(urls);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load observations",
      );
      setObservations([]);
    } finally {
      setLoading(false);
    }
  }, [deviceName]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="view-page">
      <header className="view-header">
        <div>
          <h1>Observations</h1>
          <p className="subtitle">
            Plant camera captures · {deviceName} · newest first
          </p>
        </div>
      </header>

      <p className="muted observations-note">
        Capture images are stored on the Pi and are not yet uploaded to
        Supabase Storage, so previews are unavailable here. Metadata below is
        live; image upload is planned follow-up work.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="view-status">Loading…</p>}
      {!loading && observations.length === 0 && !error && (
        <p className="view-status">No observations recorded for this device.</p>
      )}

      <section className="observations-grid">
        {observations.map((obs) => (
          <article key={obs.id} className="observation-card">
            {imageUrls[obs.id] ? (
              <img
                className="observation-image"
                src={imageUrls[obs.id]}
                alt={`Plant capture from ${formatWhen(obs.captured_at)}`}
                loading="lazy"
              />
            ) : (
              <div className="observation-image observation-image-missing">
                <span>Image not uploaded</span>
                <span className="muted">stored on the Pi only</span>
              </div>
            )}
            <div className="observation-meta">
              <span className="observation-when">
                {formatWhen(obs.captured_at)}
              </span>
              <span
                className={`observation-light observation-light-${obs.light_condition}`}
              >
                {LIGHT_LABELS[obs.light_condition] ?? obs.light_condition}
              </span>
              {obs.ndvi_estimate != null && (
                <span className="observation-ndvi tabular-nums">
                  NDVI est. {obs.ndvi_estimate.toFixed(3)}
                </span>
              )}
              {obs.health_label && (
                <span className="observation-health">{obs.health_label}</span>
              )}
              {obs.notes && (
                <p className="observation-notes muted">{obs.notes}</p>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
