/**
 * Accessibility preferences: reduce transparency and reduce motion.
 * Stored on <html> data attributes so CSS can react without React.
 */

import { useEffect, useMemo, useState } from "react";

const TRANSPARENCY_KEY = "dirt-signal-reduce-transparency";
const MOTION_KEY = "dirt-signal-reduce-motion";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeAccessibility(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    /* ignore quota / private mode */
  }
}

export function getReduceTransparency(): boolean {
  return readFlag(TRANSPARENCY_KEY);
}

export function getReduceMotion(): boolean {
  return readFlag(MOTION_KEY);
}

export function applyAccessibilityPreferences(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute(
    "data-reduce-transparency",
    getReduceTransparency() ? "true" : "false",
  );
  root.setAttribute("data-reduce-motion", getReduceMotion() ? "true" : "false");
}

export function setReduceTransparency(value: boolean): void {
  writeFlag(TRANSPARENCY_KEY, value);
  applyAccessibilityPreferences();
  notify();
}

export function setReduceMotion(value: boolean): void {
  writeFlag(MOTION_KEY, value);
  applyAccessibilityPreferences();
  notify();
}

export function toggleReduceTransparency(): boolean {
  const next = !getReduceTransparency();
  setReduceTransparency(next);
  return next;
}

export function toggleReduceMotion(): boolean {
  const next = !getReduceMotion();
  setReduceMotion(next);
  return next;
}

/** Call once at startup alongside initTheme(). */
export function initAccessibility(): void {
  applyAccessibilityPreferences();
  if (typeof document === "undefined") return;
  function syncTabHidden(): void {
    document.documentElement.setAttribute(
      "data-tab-hidden",
      document.hidden ? "true" : "false",
    );
  }
  syncTabHidden();
  document.addEventListener("visibilitychange", syncTabHidden);
}

function useAccessibilityVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(
    () => subscribeAccessibility(() => setVersion((n) => n + 1)),
    [],
  );
  return version;
}

export function useReduceTransparency(): boolean {
  const version = useAccessibilityVersion();
  return useMemo(() => {
    void version;
    return getReduceTransparency();
  }, [version]);
}

export function useReduceMotionPreference(): boolean {
  const version = useAccessibilityVersion();
  return useMemo(() => {
    void version;
    return getReduceMotion();
  }, [version]);
}

/**
 * True when motion should be reduced: user setting or OS preference.
 */
export function usePrefersReducedMotion(): boolean {
  const userPref = useReduceMotionPreference();
  const [systemPref, setSystemPref] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    function onChange() {
      setSystemPref(mq.matches);
    }
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return userPref || systemPref;
}
