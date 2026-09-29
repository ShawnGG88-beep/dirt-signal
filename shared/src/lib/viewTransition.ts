/**
 * View Transitions helper for shared-element tile → drawer opens.
 * Falls back to an instant update when reduced-motion is on or VT unsupported.
 */

export function prefersReducedMotion(): boolean {
  if (typeof document !== "undefined") {
    if (document.documentElement.getAttribute("data-reduce-motion") === "true") {
      return true;
    }
  }
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type ViewTransition = {
  finished: Promise<void>;
};

type DocumentWithVT = Document & {
  startViewTransition?: (update: () => void) => ViewTransition;
};

/** Shared-element name used by sensor tiles and the metric detail drawer. */
export const SENSOR_DETAIL_VT_NAME = "sensor-detail";

/** Shared-element name used by horizon hours and the hour detail drawer. */
export const HOUR_DETAIL_VT_NAME = "hour-detail";

/**
 * Run `update` inside a document view transition when available.
 * Always invokes `update` exactly once.
 */
export function runViewTransition(update: () => void): Promise<void> {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    update();
    return Promise.resolve();
  }
  const doc = document as DocumentWithVT;
  if (typeof doc.startViewTransition !== "function") {
    update();
    return Promise.resolve();
  }
  try {
    const transition = doc.startViewTransition(update);
    return transition.finished.catch(() => undefined);
  } catch {
    update();
    return Promise.resolve();
  }
}
