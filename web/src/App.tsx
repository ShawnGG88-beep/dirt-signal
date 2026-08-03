import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Alerts,
  AlertPollProvider,
  Dashboard,
  History,
  Reports,
  ThemeToggle,
  type MetricKey,
  type RangePreset,
} from "@dirt-signal/shared";
import { DevicePicker } from "./components/DevicePicker";
import { LoginScreen } from "./components/LoginScreen";
import { OfflineBanner } from "./components/OfflineBanner";
import { supabase, supabaseConfigured } from "./lib/supabaseClient";
import {
  formatWebHash,
  parseWebHash,
  webNavViewFromRoute,
  type WebNavView,
  type WebRoute,
} from "./lib/webRoute";
import { Observations } from "./views/Observations";
import { SoilTests } from "./views/SoilTests";
import "@dirt-signal/shared/styles/global.css";
import "./styles/web.css";

const NAV: { id: WebNavView; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
  { id: "reports", label: "Reports" },
  { id: "alerts", label: "Alerts" },
  { id: "soil-tests", label: "Soil tests" },
  { id: "observations", label: "Observations" },
];

function readRoute(): WebRoute {
  if (typeof window === "undefined") return { view: "dashboard" };
  const parsed = parseWebHash(window.location.hash);
  if (!window.location.hash || window.location.hash === "#") {
    window.history.replaceState(null, "", formatWebHash({ view: "dashboard" }));
  }
  return parsed;
}

function AppShell() {
  const [route, setRoute] = useState<WebRoute>(() => readRoute());
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [eventsEpoch, setEventsEpoch] = useState(0);

  useEffect(() => {
    function onHashChange() {
      setRoute(parseWebHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const go = useCallback((next: WebRoute) => {
    const hash = formatWebHash(next);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      setRoute(next);
    }
  }, []);

  const activeNav = webNavViewFromRoute(route);

  const detailMetric: MetricKey | null =
    route.view === "metric" ? route.key : null;
  const detailRange: RangePreset =
    route.view === "metric" ? route.range : "6h";

  return (
    <AlertPollProvider>
      <main className="app">
        <OfflineBanner />
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
                } else if (item.id === "alerts") {
                  go({ view: "alerts" });
                } else {
                  go({ view: item.id } as WebRoute);
                }
              }}
            >
              {item.label}
            </button>
          ))}
          <span className="app-nav-spacer" />
          <DevicePicker />
          <ThemeToggle />
          <button
            type="button"
            className="app-nav-btn"
            onClick={() => void supabase.auth.signOut()}
            title="Sign out"
          >
            Sign out
          </button>
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
                formatWebHash({ view: "dashboard" }),
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
        {route.view === "soil-tests" && <SoilTests />}
        {route.view === "observations" && <Observations />}
      </main>
    </AlertPollProvider>
  );
}

function ConfigNotice() {
  return (
    <main className="login-screen">
      <div className="login-panel">
        <h1>Dirt Signal</h1>
        <p className="login-subtitle">
          This deployment is missing its Supabase configuration. Set
          VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see web/.env.example)
          and redeploy.
        </p>
      </div>
    </main>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) return <ConfigNotice />;
  if (!authReady) {
    return (
      <main className="login-screen">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (!session) return <LoginScreen />;
  return <AppShell />;
}

export default App;
