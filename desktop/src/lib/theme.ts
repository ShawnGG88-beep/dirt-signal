import { useEffect, useMemo, useState } from "react";

/**
 * Theme preference + token resolution for the desktop app.
 *
 * Colours change via CSS custom properties on <html data-theme>. React only
 * re-renders when a consumer needs a concrete computed value (e.g. Recharts).
 */

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "dirt-signal-theme";
const CYCLE: ThemePreference[] = ["dark", "light", "system"];

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "system") return raw;
  } catch {
    /* ignore quota / private mode */
  }
  return "system";
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

/** Apply resolved theme by setting data-theme on <html>. */
export function applyTheme(preference: ThemePreference): void {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-preference", preference);
  root.style.colorScheme = resolved;
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }
  applyTheme(preference);
  notify();
}

/** Cycle dark → light → system. Returns the new preference. */
export function cycleThemePreference(): ThemePreference {
  const current = getStoredPreference();
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
  setThemePreference(next);
  return next;
}

/**
 * Read a computed custom property from the document element.
 * Use for Recharts / canvas APIs that cannot consume `var()`.
 * Re-read after theme changes (see useToken / useThemeVersion).
 */
export function getToken(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/** Bumps when the effective theme changes so token consumers re-render. */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeTheme(() => setVersion((n) => n + 1)), []);
  return version;
}

export function useThemePreference(): ThemePreference {
  const version = useThemeVersion();
  return useMemo(() => {
    void version;
    return getStoredPreference();
  }, [version]);
}

export function useResolvedTheme(): ResolvedTheme {
  const version = useThemeVersion();
  return useMemo(() => {
    void version;
    return resolveTheme(getStoredPreference());
  }, [version]);
}

/** Concrete colour for a token; updates when the theme changes. */
export function useToken(name: string): string {
  const version = useThemeVersion();
  return useMemo(() => {
    void version;
    return getToken(name);
  }, [name, version]);
}

export function useTokens(names: readonly string[]): Record<string, string> {
  const version = useThemeVersion();
  const key = names.join("\0");
  return useMemo(() => {
    void version;
    const out: Record<string, string> = {};
    for (const name of names) {
      out[name] = getToken(name);
    }
    return out;
  }, [key, version]);
}

export function themePreferenceLabel(preference: ThemePreference): string {
  if (preference === "dark") return "Dark theme";
  if (preference === "light") return "Light theme";
  return "System theme";
}

/** Call once at startup (before first paint if possible). */
export function initTheme(): void {
  applyTheme(getStoredPreference());

  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const onSystemChange = () => {
    if (getStoredPreference() === "system") {
      applyTheme("system");
      notify();
    }
  };
  mq.addEventListener("change", onSystemChange);
}
