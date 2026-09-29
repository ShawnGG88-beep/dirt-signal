import { useCallback, useEffect, useId, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Alerts,
  AlertPollProvider,
  Dashboard,
  DesignSystem,
  History,
  ReduceMotionToggle,
  ReduceTransparencyToggle,
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
  { id: "design", label: "Design" },
];

function readRoute(): WebRoute {
  if (typeof window === "undefined") return { view: "dashboard" };
  const parsed = parseWebHash(window.location.hash);
  if (!window.location.hash || window.location.hash === "#") {
    window.history.replaceState(null, "", formatWebHash({ view: "dashboard" }));
  }
  return parsed;
}

function navigateTo(go: (next: WebRoute) => void, item: WebNavView, route: WebRoute) {
  if (item === "dashboard") go({ view: "dashboard" });
  else if (item === "history") {
    go({
      view: "history",
      range: route.view === "history" ? route.range : "24h",
    });
  } else if (item === "reports") {
    go({
      view: "reports",
      range: route.view === "reports" ? route.range : "30d",
    });
  } else if (item === "alerts") {
    go({ view: "alerts" });
  } else if (item === "design") {
    go({ view: "design" });
  } else {
    go({ view: item } as WebRoute);
  }
}

function useMobileNav(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 560px)").matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 560px)");
    function update() {
      setIsMobile(mq.matches);
    }
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function AppShell() {
  const [route, setRoute] = useState<WebRoute>(() => readRoute());
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [eventsEpoch, setEventsEpoch] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerId = useId();
  const isMobile = useMobileNav();

  useEffect(() => {
    function onHashChange() {
      setRoute(parseWebHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Close the drawer whenever the route changes (nav link or hash edit).
  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const go = useCallback((next: WebRoute) => {
    const hash = formatWebHash(next);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      setRoute(next);
    }
  }, []);

  const activeNav = webNavViewFromRoute(route);
  const viewTitle =
    NAV.find((item) => item.id === activeNav)?.label ?? "Dashboard";

  const detailMetric: MetricKey | null =
    route.view === "metric" ? route.key : null;
  const detailRange: RangePreset =
    route.view === "metric" ? route.range : "6h";

  function renderNavButtons(className: string) {
    return NAV.map((item) => (
      <button
        key={item.id}
        type="button"
        className={
          activeNav === item.id
            ? `${className} ${className}-active`
            : className
        }
        onClick={() => navigateTo(go, item.id, route)}
      >
        {item.label}
      </button>
    ));
  }

  return (
    <AlertPollProvider>
      <div className="sky-backdrop" aria-hidden="true" />
      <main className="app">
        <OfflineBanner />

        {/* Compact mobile chrome: menu + current view + theme. */}
        <header className="app-mobile-bar">
          <button
            type="button"
            className="app-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls={drawerId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="app-menu-toggle-glyph" aria-hidden="true">
              {menuOpen ? "✕" : "☰"}
            </span>
            <span className="visually-hidden">
              {menuOpen ? "Close menu" : "Open menu"}
            </span>
          </button>
          <p className="app-mobile-title">{viewTitle}</p>
          <ThemeToggle />
        </header>

        {menuOpen && (
          <button
            type="button"
            className="app-nav-backdrop"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <nav
          id={drawerId}
          className={
            menuOpen
              ? "app-nav-drawer app-nav-drawer-open"
              : "app-nav-drawer"
          }
          aria-label={isMobile ? "Main" : undefined}
          aria-hidden={isMobile ? !menuOpen : true}
          inert={!isMobile || !menuOpen ? true : undefined}
        >
          {renderNavButtons("app-nav-drawer-link")}
          <div className="app-nav-drawer-tools">
            <DevicePicker />
            <ReduceTransparencyToggle />
            <ReduceMotionToggle />
            <button
              type="button"
              className="app-nav-drawer-link app-nav-drawer-signout"
              onClick={() => void supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </nav>

        {/* Wide-viewport horizontal nav (hidden below 560px). */}
        <nav
          className="app-nav app-nav-desktop"
          aria-label={isMobile ? undefined : "Main"}
          aria-hidden={isMobile || undefined}
          inert={isMobile ? true : undefined}
        >
          {renderNavButtons("app-nav-btn")}
          <span className="app-nav-spacer" />
          <DevicePicker />
          <ReduceTransparencyToggle />
          <ReduceMotionToggle />
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
        {route.view === "design" && <DesignSystem />}
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
