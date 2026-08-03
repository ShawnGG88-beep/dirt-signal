/**
 * Web hash routing: the shared routes plus the two web-only views.
 * Unknown hashes fall back to the dashboard, matching shared parseHash.
 */

import {
  formatHash,
  navViewFromRoute,
  parseHash,
  type AppRoute,
} from "@dirt-signal/shared";

export type WebRoute =
  | AppRoute
  | { view: "soil-tests" }
  | { view: "observations" };

export type WebNavView =
  | "dashboard"
  | "history"
  | "reports"
  | "alerts"
  | "soil-tests"
  | "observations";

export function parseWebHash(hash: string): WebRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (path === "/soil-tests" || path.startsWith("/soil-tests?")) {
    return { view: "soil-tests" };
  }
  if (path === "/observations" || path.startsWith("/observations?")) {
    return { view: "observations" };
  }
  return parseHash(hash);
}

export function formatWebHash(route: WebRoute): string {
  if (route.view === "soil-tests") return "#/soil-tests";
  if (route.view === "observations") return "#/observations";
  return formatHash(route);
}

export function webNavViewFromRoute(route: WebRoute): WebNavView {
  if (route.view === "soil-tests" || route.view === "observations") {
    return route.view;
  }
  return navViewFromRoute(route);
}
