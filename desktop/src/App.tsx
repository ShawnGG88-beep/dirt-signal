import { useCallback, useEffect, useState } from "react";
import { Alerts } from "./views/Alerts";
import { Dashboard } from "./views/Dashboard";
import { History } from "./views/History";
import { Reports } from "./views/Reports";
import {
  formatHash,
  navViewFromRoute,
  parseHash,
  type AppRoute,
  type AppView,
} from "./lib/hashRoute";
import type { MetricKey, RangePreset } from "./lib/metrics";
import "./styles/global.css";

const NAV: { id: AppView; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
  { id: "reports", label: "Reports" },
  { id: "alerts", label: "Alerts" },
];

function readRoute(): AppRoute {
  if (typeof window === "undefined") return { view: "dashboard" };
  const parsed = parseHash(window.location.hash);
  if (!window.location.hash || window.location.hash === "#") {
    window.history.replaceState(null, "", formatHash({ view: "dashboard" }));
  }
  return parsed;
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() => readRoute());
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [eventsEpoch, setEventsEpoch] = useState(0);

  useEffect(() => {
    function onHashChange() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const go = useCallback((next: AppRoute) => {
    const hash = formatHash(next);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      setRoute(next);
    }
  }, []);

  const activeNav = navViewFromRoute(route);

  const detailMetric: MetricKey | null =
    route.view === "metric" ? route.key : null;
  const detailRange: RangePreset =
    route.view === "metric" ? route.range : "6h";

  return (
    <main className="app">
      <nav className="app-nav" aria-label="Main">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              activeNav === item.id
                ? "app-nav-btn app-nav-btn-active"
                : "app-nav-btn"
            }
            onClick={() => {
              if (item.id === "dashboard") go({ view: "dashboard" });
              else if (item.id === "history") {
                go({
                  view: "history",
                  range: route.view === "history" ? route.range : "24h",
                });
              } else if (item.id === "reports") {
                go({
                  view: "reports",
                  range: route.view === "reports" ? route.range : "30d",
                });
              } else {
                go({ view: "alerts" });
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {(route.view === "dashboard" || route.view === "metric") && (
        <Dashboard
          profileEpoch={profileEpoch}
          eventsEpoch={eventsEpoch}
          onProfileChanged={() => setProfileEpoch((n) => n + 1)}
          onEventsChanged={() => setEventsEpoch((n) => n + 1)}
          detailMetric={detailMetric}
          detailRange={detailRange}
          onOpenMetric={(key) => go({ view: "metric", key, range: "6h" })}
          onCloseMetric={() => {
            window.history.replaceState(
              null,
              "",
              formatHash({ view: "dashboard" }),
            );
            setRoute({ view: "dashboard" });
          }}
          onDetailRangeChange={(range) => {
            if (route.view === "metric") {
              go({ view: "metric", key: route.key, range });
            }
          }}
          onOpenHistory={(range) => go({ view: "history", range })}
        />
      )}
      {route.view === "history" && (
        <History
          profileEpoch={profileEpoch}
          eventsEpoch={eventsEpoch}
          range={route.range}
          onRangeChange={(range) => go({ view: "history", range })}
          onEventsChanged={() => setEventsEpoch((n) => n + 1)}
        />
      )}
      {route.view === "reports" && (
        <Reports
          profileEpoch={profileEpoch}
          eventsEpoch={eventsEpoch}
          range={route.range}
          onRangeChange={(range) => go({ view: "reports", range })}
        />
      )}
      {route.view === "alerts" && <Alerts />}
    </main>
  );
}

export default App;
