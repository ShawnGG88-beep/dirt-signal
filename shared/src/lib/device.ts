/**
 * Selected device store.
 *
 * Replaces the DEVICE_NAME constant that was duplicated across the views.
 * Desktop renders no picker and stays on the default device; web renders a
 * picker that writes here. Persisted so the choice survives reloads.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "dirt-signal-device";

export const DEFAULT_DEVICE_NAME = "pi-garden-01";

type Listener = () => void;
const listeners = new Set<Listener>();

function load(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw.trim()) return raw.trim();
  } catch {
    /* ignore quota / private mode */
  }
  return DEFAULT_DEVICE_NAME;
}

let current: string = load();

export function getSelectedDeviceName(): string {
  return current;
}

export function setSelectedDeviceName(name: string): void {
  const next = name.trim() || DEFAULT_DEVICE_NAME;
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  for (const listener of listeners) listener();
}

export function subscribeSelectedDevice(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reactive selected device name for views. */
export function useSelectedDeviceName(): string {
  return useSyncExternalStore(
    subscribeSelectedDevice,
    getSelectedDeviceName,
    () => DEFAULT_DEVICE_NAME,
  );
}
