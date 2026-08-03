/**
 * Timestamp of the last successful data fetch, for the offline state. Every
 * data-client call records success here; the offline banner reads it so a
 * user without connectivity can see how old the visible data is.
 */

import { useSyncExternalStore } from "react";

type Listener = () => void;
const listeners = new Set<Listener>();

let lastSuccessfulFetchMs: number | null = null;

export function recordSuccessfulFetch(): void {
  lastSuccessfulFetchMs = Date.now();
  for (const listener of listeners) listener();
}

export function getLastSuccessfulFetchMs(): number | null {
  return lastSuccessfulFetchMs;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLastSuccessfulFetchMs(): number | null {
  return useSyncExternalStore(
    subscribe,
    getLastSuccessfulFetchMs,
    () => null,
  );
}
