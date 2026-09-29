/**
 * Frame-time probe for Tauri / WebKitGTK performance checks.
 *
 * Two measurements:
 * 1. rAF deltas — vsync-coupled; reports display refresh and whether the
 *    sample is capped by the refresh bucket rather than render cost.
 * 2. Sync paint cost — forces style/layout after invalidating backdrop-filter;
 *    not bucketed by vsync, so default vs low-blur can be compared for real work.
 */

export interface SyncPaintCost {
  iterations: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface PerfProbeSample {
  frames: number;
  durationMs: number;
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  estimatedFps: number;
  /** Median-inferred display refresh from rAF (Hz). */
  displayRefreshHz: number | null;
  /** Nearest common refresh bucket (30/60/90/120/144), if within 8%. */
  refreshBucketHz: number | null;
  /** True when avg rAF delta matches a refresh bucket (measurement is vsync-capped). */
  rafLooksVsyncCapped: boolean;
  /** Forced backdrop-filter invalidate + sync layout cost (uncapped). */
  syncPaintCost: SyncPaintCost;
  blurL1: string;
  userAgent: string;
}

export interface PerfProbeOptions {
  /** rAF sample window in ms. Default 3000. */
  durationMs?: number;
  /**
   * When true, temporarily sets --glass-blur-l1 to the low fallback (12px)
   * for A/B comparison per the brief.
   */
  lowBlur?: boolean;
  /** Sync paint iterations. Default 48. */
  paintIterations?: number;
}

const LOW_BLUR_L1 = "12px";
const REFRESH_BUCKETS = [30, 60, 90, 120, 144] as const;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * p)),
  );
  return sorted[idx] ?? 0;
}

function summarise(deltas: number[]): {
  avg: number;
  p95: number;
  max: number;
  median: number;
} {
  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg: sorted.length ? sum / sorted.length : 0,
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
    median: percentile(sorted, 0.5),
  };
}

function nearestRefreshBucket(hz: number): number | null {
  let best: number | null = null;
  let bestErr = Infinity;
  for (const bucket of REFRESH_BUCKETS) {
    const err = Math.abs(hz - bucket) / bucket;
    if (err < bestErr) {
      bestErr = err;
      best = bucket;
    }
  }
  return bestErr <= 0.08 ? best : null;
}

function waitFrame(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame((t) => resolve(t));
  });
}

/**
 * Force style recalc + layout after a tiny backdrop-filter invalidate.
 * Times wall-clock work, not vsync presentation.
 */
export function measureSyncPaintCost(iterations = 48): SyncPaintCost {
  const root = document.documentElement;
  const panels = [
    ...document.querySelectorAll<HTMLElement>(
      ".sky-backdrop, .glass-l1, .glass-l2, .glass-l3, .weather-horizon",
    ),
  ];
  const costs: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    root.setAttribute("data-perf-tick", String(i % 2));
    for (const el of panels) {
      void el.getBoundingClientRect();
    }
    void document.body?.offsetHeight;
    costs.push(performance.now() - t0);
  }
  root.removeAttribute("data-perf-tick");

  const stats = summarise(costs);
  return {
    iterations: costs.length,
    avgMs: stats.avg,
    p95Ms: stats.p95,
    maxMs: stats.max,
  };
}

export async function inferDisplayRefreshHz(
  sampleMs = 1200,
): Promise<{ hz: number; bucketHz: number | null; medianFrameMs: number }> {
  // Warm up so the first resume gap is discarded.
  for (let i = 0; i < 8; i += 1) await waitFrame();

  const deltas: number[] = [];
  let last = await waitFrame();
  const start = last;
  while (last - start < sampleMs) {
    const now = await waitFrame();
    const d = now - last;
    last = now;
    // Drop background/throttle outliers (>2.5× expected 60Hz frame).
    if (d > 0 && d < 42) deltas.push(d);
  }

  const stats = summarise(deltas);
  const hz = stats.median > 0 ? 1000 / stats.median : 0;
  return {
    hz,
    bucketHz: nearestRefreshBucket(hz),
    medianFrameMs: stats.median,
  };
}

export async function runPerfProbe(
  opts: PerfProbeOptions = {},
): Promise<PerfProbeSample> {
  const durationMs = opts.durationMs ?? 3000;
  const paintIterations = opts.paintIterations ?? 48;
  const root = document.documentElement;
  const prevInlineBlur = root.style.getPropertyValue("--glass-blur-l1");

  // Always start from a known blur mode (avoids swapped labels after prior runs).
  root.style.removeProperty("--glass-blur-l1");
  root.removeAttribute("data-perf-blur");
  if (opts.lowBlur) {
    root.style.setProperty("--glass-blur-l1", LOW_BLUR_L1);
    root.setAttribute("data-perf-blur", "low");
  }

  // Let the new blur radius apply before sampling.
  await waitFrame();
  await waitFrame();

  const blurL1 = getComputedStyle(root).getPropertyValue("--glass-blur-l1").trim();
  const refresh = await inferDisplayRefreshHz(1000);

  const deltas: number[] = [];
  let last = await waitFrame();
  const start = last;
  while (last - start < durationMs) {
    const now = await waitFrame();
    const d = now - last;
    last = now;
    // Keep presentation-interval samples; drop only multi-second tab-throttle gaps.
    if (d > 0 && d < 250) deltas.push(d);
  }

  const syncPaintCost = measureSyncPaintCost(paintIterations);

  root.style.removeProperty("--glass-blur-l1");
  root.removeAttribute("data-perf-blur");
  if (prevInlineBlur) {
    root.style.setProperty("--glass-blur-l1", prevInlineBlur);
  }

  const stats = summarise(deltas);
  const bucket = refresh.bucketHz;
  const rafLooksVsyncCapped =
    deltas.length >= 10 &&
    bucket != null &&
    Math.abs(stats.avg - 1000 / bucket) / (1000 / bucket) <= 0.1;

  return {
    frames: deltas.length,
    durationMs: last - start,
    avgFrameMs: stats.avg,
    p95FrameMs: stats.p95,
    maxFrameMs: stats.max,
    estimatedFps: stats.avg > 0 ? 1000 / stats.avg : 0,
    displayRefreshHz: refresh.hz > 0 ? refresh.hz : null,
    refreshBucketHz: bucket,
    rafLooksVsyncCapped,
    syncPaintCost,
    blurL1,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}

export interface PerfProbePair {
  default: PerfProbeSample;
  lowL1: PerfProbeSample;
  measuredAt: string;
}

/** Run default then low-blur probes back to back for CI / Design page. */
export async function runPerfProbePair(
  opts: Omit<PerfProbeOptions, "lowBlur"> = {},
): Promise<PerfProbePair> {
  const def = await runPerfProbe({ ...opts, lowBlur: false });
  const low = await runPerfProbe({ ...opts, lowBlur: true });
  return {
    default: def,
    lowL1: low,
    measuredAt: new Date().toISOString(),
  };
}

/** Attach globals for console / WebKitGTK harness use. */
export function installPerfProbeGlobal(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    __dirtPerfProbe: typeof runPerfProbe;
    __dirtPerfProbePair: typeof runPerfProbePair;
  };
  w.__dirtPerfProbe = runPerfProbe;
  w.__dirtPerfProbePair = runPerfProbePair;
}
