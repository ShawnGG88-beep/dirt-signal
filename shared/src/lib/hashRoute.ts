import {
  isRangePreset,
  metricKeyFromSlug,
  METRIC_SLUG,
  type MetricKey,
  type RangePreset,
} from "./metrics";

export type AppView = "dashboard" | "history" | "reports" | "alerts";

export type AppRoute =
  | { view: "dashboard" }
  | { view: "history"; range: RangePreset }
  | { view: "reports"; range: RangePreset }
  | { view: "alerts" }
  | { view: "metric"; key: MetricKey; range: RangePreset };

const DEFAULT_HISTORY_RANGE: RangePreset = "24h";
const DEFAULT_REPORTS_RANGE: RangePreset = "30d";
const DEFAULT_METRIC_RANGE: RangePreset = "6h";

function parseQuery(search: string): URLSearchParams {
  const trimmed = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(trimmed);
}

function rangeFromParams(
  params: URLSearchParams,
  fallback: RangePreset,
): RangePreset {
  const raw = params.get("range");
  if (raw && isRangePreset(raw)) return raw;
  return fallback;
}

/** Parse location.hash into a typed route. Empty / unknown → dashboard. */
export function parseHash(hash: string): AppRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const qIndex = path.indexOf("?");
  const pathname = (qIndex >= 0 ? path.slice(0, qIndex) : path).replace(
    /\/+$/,
    "",
  ) || "/";
  const search = qIndex >= 0 ? path.slice(qIndex) : "";
  const params = parseQuery(search);
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 0 || parts[0] === "dashboard") {
    return { view: "dashboard" };
  }

  if (parts[0] === "history") {
    return {
      view: "history",
      range: rangeFromParams(params, DEFAULT_HISTORY_RANGE),
    };
  }

  if (parts[0] === "reports") {
    return {
      view: "reports",
      range: rangeFromParams(params, DEFAULT_REPORTS_RANGE),
    };
  }

  if (parts[0] === "alerts") {
    return { view: "alerts" };
  }

  if (parts[0] === "metric" && parts[1]) {
    const key = metricKeyFromSlug(parts[1]);
    if (key) {
      return {
        view: "metric",
        key,
        range: rangeFromParams(params, DEFAULT_METRIC_RANGE),
      };
    }
  }

  return { view: "dashboard" };
}

export function formatHash(route: AppRoute): string {
  if (route.view === "dashboard") return "#/dashboard";
  if (route.view === "history") return `#/history?range=${route.range}`;
  if (route.view === "reports") return `#/reports?range=${route.range}`;
  if (route.view === "alerts") return "#/alerts";
  return `#/metric/${METRIC_SLUG[route.key]}?range=${route.range}`;
}

export function navigateHash(route: AppRoute, replace = false): void {
  const next = formatHash(route);
  if (replace) {
    window.location.replace(next);
  } else if (window.location.hash !== next) {
    window.location.hash = next;
  }
}

export function navViewFromRoute(route: AppRoute): AppView {
  if (route.view === "metric") return "dashboard";
  return route.view;
}
