/**
 * Observation image resolution, isolated so the pending pi-collector
 * Storage upload lands as a change to this file alone.
 *
 * Today the collector saves JPEGs to the Pi's local filesystem and stores
 * only that local path in plant_observations.image_path; nothing is
 * uploaded to Supabase Storage, so there is no URL to give the browser.
 * Once the collector uploads captures to a Storage bucket and records the
 * object path, this function becomes a createSignedUrl call, e.g.:
 *
 *   const { data } = await supabase.storage
 *     .from("plant-observations")
 *     .createSignedUrl(observation.image_path, 3600);
 *   return data?.signedUrl ?? null;
 */

export interface ObservationImageRef {
  image_path: string | null;
}

export async function resolveObservationImageUrl(
  _observation: ObservationImageRef,
): Promise<string | null> {
  return null;
}
