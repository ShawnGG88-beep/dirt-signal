/**
 * Auto-run frame-time probes when the Design page is opened with ?autoperf=1
 * (before the hash) or #/design?autoperf=1. Used by the Linux WebKitGTK harness.
 */
import { useEffect, useState } from "react";
import {
  runPerfProbePair,
  type PerfProbePair,
  type PerfProbeSample,
} from "../lib/perfProbe";

function wantsAutoPerf(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  if (q.get("autoperf") === "1") return true;
  const hash = window.location.hash;
  return /[?&]autoperf=1(?:&|$)/.test(hash);
}

export function useAutoPerfProbe(): {
  pair: PerfProbePair | null;
  busy: boolean;
  error: string | null;
} {
  const [pair, setPair] = useState<PerfProbePair | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wantsAutoPerf()) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        // Let glass + backdrop paint once before measuring.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await new Promise((r) => setTimeout(r, 400));
        const result = await runPerfProbePair({ durationMs: 2500 });
        if (cancelled) return;
        setPair(result);
        document.documentElement.setAttribute(
          "data-perf-result",
          JSON.stringify(result),
        );
        document.title = "DIRT_PERF_DONE";
        console.info("[dirt-perf]", result);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        document.documentElement.setAttribute("data-perf-error", message);
        document.title = `DIRT_PERF_ERROR:${message}`;
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { pair, busy, error };
}

export function formatProbeLine(sample: PerfProbeSample): string {
  const refresh =
    sample.displayRefreshHz != null
      ? `${sample.displayRefreshHz.toFixed(1)} Hz` +
        (sample.refreshBucketHz != null
          ? ` (bucket ${sample.refreshBucketHz})`
          : "")
      : "unknown";
  return [
    `rAF avg ${sample.avgFrameMs.toFixed(2)} ms`,
    `p95 ${sample.p95FrameMs.toFixed(2)} ms`,
    `max ${sample.maxFrameMs.toFixed(2)} ms`,
    `~${sample.estimatedFps.toFixed(0)} fps`,
    `refresh ${refresh}`,
    sample.rafLooksVsyncCapped ? "rAF vsync-capped" : "rAF not vsync-capped",
    `sync paint avg ${sample.syncPaintCost.avgMs.toFixed(2)} ms`,
    `p95 ${sample.syncPaintCost.p95Ms.toFixed(2)} ms`,
    `blur ${sample.blurL1 || "?"}`,
  ].join(" · ");
}
