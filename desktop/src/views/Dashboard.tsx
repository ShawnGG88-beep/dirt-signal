import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  fetchDailyAggregates,
  fetchEvents,
  fetchHealth,
  fetchLatestReading,
  fetchReadingsRange,
  staleAfterMsFromInterval,
  type PlantEvent,
  type SensorReading,
} from "../lib/api";
import { BandPositionBar } from "../components/BandPositionBar";
import { LogEventForm } from "../components/LogEventForm";
import { MetricDetailModal } from "../components/MetricDetailModal";
import { PlantProfileSection } from "../components/PlantProfileSection";
import { Sparkline } from "../components/Sparkline";
import {
  STATUS_GLYPH,
  STATUS_TEXT,
} from "../components/StatusIndicator";
import {
  formatRelativeAge,
  SystemStatusLine,
} from "../components/SystemStatusLine";
import { DEFAULT_DEVICE_TIMEZONE } from "../lib/dayNight";
import {
  dewPointC,
  projectDrydown,
  vapourPressureDeficitKpa,
} from "../lib/derived";
import { eventTypeLabel } from "../lib/eventTypes";
import {
  DEFAULT_CROP_TYPE,
  DEFAULT_LIFECYCLE_STAGE,
  getScoringSemantic,
  SAMPLING_LIMITATIONS,
  type ScoringSemantic,
} from "../lib/growingConstants";
import {
  formatMetricValue,
  getAmbientBoundsForProfile,
  getMetricBoundsForProfile,
  METRICS,
  scoreMetricValue,
  type MetricDef,
  type MetricKey,
  type MetricScore,
  type MetricStatus,
  type RangePreset,
} from "../lib/metrics";
import { useAlertPoll } from "../lib/useAlertPoll";

const DEVICE_NAME = "pi-garden-01";
const POLL_MS = 30_000;
const SPARK_WINDOW_LABEL = "6h";
const VPD_LIMITATION = SAMPLING_LIMITATIONS[3];

function scoreForCard(
  key: MetricKey,
  value: number | null | undefined,
  cropType: string,
  lifecycleStage: string,
  recordedAt: string | null | undefined,
  timeZone: string,
  derived?: boolean,
): MetricScore {
  const semantic = getScoringSemantic(cropType, lifecycleStage);
  if (derived || key === "moisture_raw") {
    return scoreMetricValue(value, null, semantic, { displayOnly: true });
  }
  if (key === "ambient_temp_c") {
    const at = recordedAt ?? new Date().toISOString();
    const bounds = getAmbientBoundsForProfile(
      at,
      cropType,
      lifecycleStage,
      timeZone,
    );
    return scoreMetricValue(value, bounds, semantic);
  }
  const bounds = getMetricBoundsForProfile(key, cropType, lifecycleStage);
  return scoreMetricValue(value, bounds, semantic);
}

function sparkDelta(
  values: number[],
  unit: string,
): { text: string; direction: "up" | "down" | "flat" } | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const abs = Math.abs(delta);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  const suffix = unit ? `${formatted}${unit}` : formatted;
  if (Math.abs(delta) < 1e-9) {
    return { text: `→ 0${unit ? unit : ""} / ${SPARK_WINDOW_LABEL}`, direction: "flat" };
  }
  if (delta > 0) {
    return { text: `↑ ${suffix} / ${SPARK_WINDOW_LABEL}`, direction: "up" };
  }
  return { text: `↓ ${suffix} / ${SPARK_WINDOW_LABEL}`, direction: "down" };
}

interface PrimaryCardProps {
  metric: MetricDef;
  value: number | null | undefined;
  score: MetricScore;
  sparkValues: number[];
  scoringSemantic: ScoringSemantic;
  fetching: boolean;
  rangeError: string | null;
  onRetryRange: () => void;
  onOpen: () => void;
}

function PrimaryMetricCard({
  metric,
  value,
  score,
  sparkValues,
  scoringSemantic,
  fetching,
  rangeError,
  onRetryRange,
  onOpen,
}: PrimaryCardProps) {
  const delta = sparkDelta(sparkValues, metric.unit);
  const isNull = value === null || value === undefined;
  const status: MetricStatus = isNull ? "unknown" : score.status;

  function activate() {
    onOpen();
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  }

  return (
    <div
      className={`metric-card metric-card-primary${fetching ? " metric-card-fetching" : ""}`}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={onKeyDown}
      aria-label={`${metric.label}: ${formatMetricValue(value, metric.unit)}, ${STATUS_TEXT[status]}`}
    >
      <div className="metric-header">
        <span className="metric-label">{metric.label}</span>
        {delta && (
          <span className={`metric-delta metric-delta-${delta.direction}`}>
            {delta.text}
          </span>
        )}
      </div>
      <div className="metric-value tabular-nums">
        {formatMetricValue(value, metric.unit)}
      </div>
      <BandPositionBar
        bounds={score.bounds}
        position={score.position}
        status={status}
        scoringSemantic={scoringSemantic}
        disabled={isNull || score.bounds === null}
      />
      <div className={`metric-status metric-status-${status}`}>
        <span className="metric-status-glyph" aria-hidden="true">
          {STATUS_GLYPH[status]}
        </span>
        <span className="metric-status-text">{STATUS_TEXT[status]}</span>
      </div>
      <div className="metric-spark">
        {rangeError ? (
          <button
            type="button"
            className="metric-inline-retry"
            onClick={(e) => {
              e.stopPropagation();
              onRetryRange();
            }}
          >
            Sparkline failed · retry
          </button>
        ) : (
          <Sparkline
            values={sparkValues}
            colour={metric.colour}
            bounds={score.bounds}
            width={160}
            height={36}
          />
        )}
      </div>
    </div>
  );
}

interface ContextCardProps {
  metric: MetricDef;
  value: number | null | undefined;
  score: MetricScore;
  fetching: boolean;
  onOpen: () => void;
}

function ContextMetricCard({
  metric,
  value,
  score,
  fetching,
  onOpen,
  trendText,
}: ContextCardProps & { trendText?: string | null }) {
  const isNull = value === null || value === undefined;
  const derived = metric.derived === true;
  const status: MetricStatus = isNull ? "unknown" : score.status;

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <div
      className={`metric-card metric-card-context${fetching ? " metric-card-fetching" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={
        derived
          ? `${metric.label}: ${formatMetricValue(value, metric.unit)}`
          : `${metric.label}: ${formatMetricValue(value, metric.unit)}, ${STATUS_TEXT[status]}`
      }
    >
      <div className="metric-header">
        <span className="metric-label">{metric.label}</span>
        {!derived && (
          <div className={`metric-status metric-status-${status}`}>
            <span className="metric-status-glyph" aria-hidden="true">
              {STATUS_GLYPH[status]}
            </span>
            <span className="metric-status-text">{STATUS_TEXT[status]}</span>
          </div>
        )}
      </div>
      <div className="metric-value metric-value-compact tabular-nums">
        {formatMetricValue(value, metric.unit)}
      </div>
      {trendText && (
        <div className="metric-trend muted">{trendText}</div>
      )}
      {derived && metric.key === "vpd_kpa" && (
        <p className="metric-caveat muted" title={VPD_LIMITATION}>
          Air VPD · leaf≈air assumption
        </p>
      )}
    </div>
  );
}

interface DiagnosticsStripProps {
  reading: SensorReading | null;
  expanded: boolean;
  onToggle: () => void;
  onOpenMetric: (key: MetricKey) => void;
}

function DiagnosticsStrip({
  reading,
  expanded,
  onToggle,
  onOpenMetric,
}: DiagnosticsStripProps) {
  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  }

  const raw = reading?.moisture_raw;
  const ec = reading?.ec_us_cm ?? null;
  const n = reading?.npk_n_est ?? null;
  const p = reading?.npk_p_est ?? null;
  const k = reading?.npk_k_est ?? null;

  return (
    <section className="diagnostics-strip">
      <div
        className="diagnostics-toggle"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={onKeyDown}
      >
        <span className="diagnostics-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span>Diagnostics</span>
        <span className="diagnostics-hint">
          display only, not scored
        </span>
      </div>
      {expanded && (
        <div className="diagnostics-body">
          <button
            type="button"
            className="diagnostics-item"
            onClick={() => onOpenMetric("moisture_raw")}
          >
            <span className="diagnostics-item-label">Raw ADC</span>
            <span className="diagnostics-item-value tabular-nums">
              {raw === null || raw === undefined ? "—" : String(raw)}
            </span>
          </button>
          <div className="diagnostics-item diagnostics-item-static">
            <span className="diagnostics-item-label">EC µS/cm</span>
            <span className="diagnostics-item-value tabular-nums">
              {ec === null ? "—" : String(ec)}
            </span>
          </div>
          <div className="diagnostics-item diagnostics-item-static">
            <span className="diagnostics-item-label">N est.</span>
            <span className="diagnostics-item-value tabular-nums">
              {n === null ? "—" : String(n)}
            </span>
          </div>
          <div className="diagnostics-item diagnostics-item-static">
            <span className="diagnostics-item-label">P est.</span>
            <span className="diagnostics-item-value tabular-nums">
              {p === null ? "—" : String(p)}
            </span>
          </div>
          <div className="diagnostics-item diagnostics-item-static">
            <span className="diagnostics-item-label">K est.</span>
            <span className="diagnostics-item-value tabular-nums">
              {k === null ? "—" : String(k)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

interface DashboardProps {
  profileEpoch: number;
  eventsEpoch: number;
  onProfileChanged: () => void;
  onEventsChanged: () => void;
  detailMetric: MetricKey | null;
  detailRange: RangePreset;
  onOpenMetric: (key: MetricKey) => void;
  onCloseMetric: () => void;
  onDetailRangeChange: (range: RangePreset) => void;
  onOpenHistory: (range: RangePreset) => void;
}

export function Dashboard({
  profileEpoch,
  eventsEpoch,
  onProfileChanged,
  onEventsChanged,
  detailMetric,
  detailRange,
  onOpenMetric,
  onCloseMetric,
  onDetailRangeChange,
  onOpenHistory,
}: DashboardProps) {
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [recentEvents, setRecentEvents] = useState<PlantEvent[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [cropType, setCropType] = useState<string>(DEFAULT_CROP_TYPE);
  const [lifecycleStage, setLifecycleStage] = useState<string>(
    DEFAULT_LIFECYCLE_STAGE,
  );
  const [timeZone, setTimeZone] = useState(DEFAULT_DEVICE_TIMEZONE);
  const [seasonStartDate, setSeasonStartDate] = useState<string | null>(null);
  const [cumulativeGdd, setCumulativeGdd] = useState<number | null>(null);
  const [gddDaysExcluded, setGddDaysExcluded] = useState(0);
  const [gddUnavailable, setGddUnavailable] = useState<string | null>(
    "no_season_start",
  );
  const [drydownLine, setDrydownLine] = useState<string | null>(null);
  const { openNotifyCount, worstNotifySeverity } = useAlertPoll();
  const [sidecarReachable, setSidecarReachable] = useState<boolean | null>(
    null,
  );
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [staleAfterMs, setStaleAfterMs] = useState(() =>
    staleAfterMsFromInterval(undefined),
  );
  const [latestError, setLatestError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [lastPollAt, setLastPollAt] = useState<Date | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logEventOpen, setLogEventOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const returnFocusEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshRange = useCallback(async () => {
    try {
      const range = await fetchReadingsRange(
        new Date(Date.now() - 6 * 60 * 60 * 1000),
        new Date(),
        DEVICE_NAME,
        120,
      );
      setHistory(range.readings);
      setRangeError(null);
    } catch (err) {
      setRangeError(
        err instanceof Error ? err.message : "Failed to fetch range",
      );
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      const result = await fetchEvents({
        deviceName: DEVICE_NAME,
        limit: 5,
      });
      setRecentEvents(result.events);
    } catch {
      // Keep prior list; events are orientation, not critical path.
    }
  }, []);

  const refresh = useCallback(async () => {
    setFetching(true);

    const healthTask = fetchHealth()
      .then((health) => {
        setSidecarReachable(true);
        setHealthOk(health.status === "ok");
        setStaleAfterMs(
          staleAfterMsFromInterval(health.collector_interval_seconds),
        );
      })
      .catch(() => {
        setSidecarReachable(false);
        setHealthOk(false);
      });

    const latestTask = fetchLatestReading(DEVICE_NAME)
      .then((latest) => {
        setReading(latest.reading);
        setDeviceId(latest.device_id ?? latest.reading?.device_id ?? null);
        setCropType(latest.crop_type ?? DEFAULT_CROP_TYPE);
        setLifecycleStage(latest.lifecycle_stage ?? DEFAULT_LIFECYCLE_STAGE);
        setTimeZone(latest.timezone ?? DEFAULT_DEVICE_TIMEZONE);
        setSeasonStartDate(latest.season_start_date ?? null);
        setLatestError(null);
      })
      .catch((err) => {
        setLatestError(
          err instanceof Error ? err.message : "Failed to fetch latest",
        );
      });

    const gddTask = fetchDailyAggregates(
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      new Date(),
      DEVICE_NAME,
    )
      .then((agg) => {
        setCumulativeGdd(agg.cumulative_gdd);
        setGddDaysExcluded(agg.days_excluded);
        setGddUnavailable(agg.cumulative_gdd_unavailable_reason);
        setSeasonStartDate(agg.season_start_date);
      })
      .catch(() => {
        /* GDD is additive context; keep prior */
      });

    const drydownTask = Promise.all([
      fetchReadingsRange(
        new Date(Date.now() - 72 * 60 * 60 * 1000),
        new Date(),
        DEVICE_NAME,
        500,
      ),
      fetchEvents({
        deviceName: DEVICE_NAME,
        fromAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
        toAt: new Date(),
        limit: 200,
      }),
      fetchLatestReading(DEVICE_NAME),
    ])
      .then(([range, eventsRes, latest]) => {
        const crop = latest.crop_type ?? DEFAULT_CROP_TYPE;
        const stage = latest.lifecycle_stage ?? DEFAULT_LIFECYCLE_STAGE;
        const bounds = getMetricBoundsForProfile("moisture_pct", crop, stage);
        const result = projectDrydown(range.readings, eventsRes.events, {
          moistureLowerBound: bounds?.min ?? null,
          now: new Date(),
        });
        if (result.projection && result.projection.hours_to_lower_bound > 0) {
          const h = result.projection.hours_to_lower_bound;
          const hoursLabel =
            h >= 10 ? `~${Math.round(h)}h` : `~${h.toFixed(1)}h`;
          setDrydownLine(
            `reaches ${result.projection.moisture_lower_bound.toFixed(0)}% in ${hoursLabel} at current rate`,
          );
        } else {
          setDrydownLine(null);
        }
      })
      .catch(() => setDrydownLine(null));

    const rangeTask = refreshRange();
    const eventsTask = refreshEvents();

    await Promise.allSettled([
      healthTask,
      latestTask,
      rangeTask,
      eventsTask,
      gddTask,
      drydownTask,
    ]);
    setLastPollAt(new Date());
    setFetching(false);
  }, [refreshRange, refreshEvents]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, profileEpoch, eventsEpoch]);

  useEffect(() => {
    if (!detailMetric && returnFocusEl.current) {
      returnFocusEl.current.focus();
      returnFocusEl.current = null;
    }
  }, [detailMetric]);

  useEffect(() => {
    if (!profileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileOpen]);

  const semantic = getScoringSemantic(cropType, lifecycleStage);
  const primary = METRICS.filter((m) => m.tier === "primary");
  const context = METRICS.filter((m) => m.tier === "context");

  function openMetric(key: MetricKey) {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      returnFocusEl.current = active;
    }
    onOpenMetric(key);
  }

  function sparkFor(key: MetricKey): number[] {
    if (key === "vpd_kpa") {
      return history
        .map((r) =>
          vapourPressureDeficitKpa(r.ambient_temp_c, r.ambient_humidity_pct),
        )
        .filter((v): v is number => v !== null);
    }
    if (key === "dew_point_c") {
      return history
        .map((r) => dewPointC(r.ambient_temp_c, r.ambient_humidity_pct))
        .filter((v): v is number => v !== null);
    }
    return history
      .map((r) => r[key as keyof SensorReading])
      .filter((v): v is number => typeof v === "number");
  }

  function valueFor(key: MetricKey): number | null | undefined {
    if (key === "vpd_kpa") {
      return vapourPressureDeficitKpa(
        reading?.ambient_temp_c,
        reading?.ambient_humidity_pct,
      );
    }
    if (key === "dew_point_c") {
      return dewPointC(reading?.ambient_temp_c, reading?.ambient_humidity_pct);
    }
    return reading?.[key as keyof SensorReading] as number | null | undefined;
  }

  function trendFor(key: MetricKey): string | null {
    const values = sparkFor(key);
    if (values.length < 2) return null;
    const delta = values[values.length - 1] - values[0];
    if (Math.abs(delta) < 1e-6) return `→ / ${SPARK_WINDOW_LABEL}`;
    const abs = Math.abs(delta);
    const formatted = abs >= 10 ? abs.toFixed(0) : abs.toFixed(2);
    return `${delta > 0 ? "↑" : "↓"} ${formatted} / ${SPARK_WINDOW_LABEL}`;
  }

  const gddDaysElapsed =
    seasonStartDate != null
      ? Math.max(
          1,
          Math.ceil(
            (Date.now() - new Date(`${seasonStartDate}T00:00:00Z`).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : null;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Dirt Signal</h1>
          <p className="dashboard-gdd muted">
            {gddUnavailable === "no_season_start" || seasonStartDate == null ? (
              <>
                Degree days unavailable —{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setProfileOpen(true)}
                >
                  set season start
                </button>
              </>
            ) : (
              <>
                {cumulativeGdd != null
                  ? `${cumulativeGdd.toFixed(0)} °C·d`
                  : "—"}{" "}
                · {gddDaysElapsed}d since season start
                {gddDaysExcluded > 0
                  ? ` · ${gddDaysExcluded}d excluded (sparse)`
                  : ""}
                <span className="dashboard-gdd-note" title="Indoor degree days under artificial light are not comparable to field GDD / Winkler.">
                  {" "}
                  (device degree days)
                </span>
              </>
            )}
          </p>
        </div>
        <SystemStatusLine
          sidecarReachable={sidecarReachable}
          healthOk={healthOk}
          deviceName={DEVICE_NAME}
          readingAt={reading?.recorded_at ?? null}
          cropType={cropType}
          lifecycleStage={lifecycleStage}
          lastPollAt={lastPollAt}
          staleAfterMs={staleAfterMs}
          onOpenProfile={() => setProfileOpen(true)}
          openAlertCount={openNotifyCount}
          worstAlertSeverity={worstNotifySeverity}
          onOpenAlerts={() => {
            window.location.hash = "#/alerts";
          }}
        />
      </header>

      <div className="dashboard-actions">
        <button
          type="button"
          className="log-event-btn"
          onClick={() => setLogEventOpen(true)}
        >
          Log event
        </button>
      </div>

      {fetching && <div className="fetch-progress" aria-hidden="true" />}

      {latestError && !reading && (
        <div className="error-banner">{latestError}</div>
      )}

      <div className={fetching ? "dashboard-content is-fetching" : "dashboard-content"}>
        <section className="metrics-primary" aria-label="Primary metrics">
          {primary.map((metric) => {
            const value = valueFor(metric.key);
            const score = scoreForCard(
              metric.key,
              value,
              cropType,
              lifecycleStage,
              reading?.recorded_at,
              timeZone,
              metric.derived,
            );
            return (
              <div key={metric.key} className="primary-metric-wrap">
                <PrimaryMetricCard
                  metric={metric}
                  value={value}
                  score={score}
                  sparkValues={sparkFor(metric.key)}
                  scoringSemantic={semantic}
                  fetching={fetching}
                  rangeError={rangeError}
                  onRetryRange={() => void refreshRange()}
                  onOpen={() => openMetric(metric.key)}
                />
                {metric.key === "moisture_pct" && drydownLine && (
                  <p className="drydown-line muted">{drydownLine}</p>
                )}
              </div>
            );
          })}
        </section>

        <section className="metrics-context" aria-label="Context metrics">
          {context.map((metric) => {
            const value = valueFor(metric.key);
            const score = scoreForCard(
              metric.key,
              value,
              cropType,
              lifecycleStage,
              reading?.recorded_at,
              timeZone,
              metric.derived,
            );
            return (
              <ContextMetricCard
                key={metric.key}
                metric={metric}
                value={value}
                score={score}
                fetching={fetching}
                onOpen={() => openMetric(metric.key)}
                trendText={metric.derived ? trendFor(metric.key) : null}
              />
            );
          })}
        </section>

        <section className="recent-events" aria-label="Recent events">
          <div className="recent-events-header">
            <h2>Recent events</h2>
            <span className="recent-events-hint">last 5</span>
          </div>
          {recentEvents.length === 0 ? (
            <p className="recent-events-empty">No events yet</p>
          ) : (
            <ul className="recent-events-list">
              {recentEvents.map((event) => {
                const age = formatRelativeAge(
                  new Date(event.occurred_at).getTime(),
                  nowMs,
                );
                const range = historyRangeForEvent(event.occurred_at);
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="recent-event-link"
                      onClick={() => onOpenHistory(range)}
                      title={`Open History (${range})`}
                    >
                      <span className="recent-event-type">
                        {eventTypeLabel(event.event_type).toLowerCase()}
                      </span>
                      <span className="recent-event-age">{age} ago</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <DiagnosticsStrip
          reading={reading}
          expanded={diagnosticsOpen}
          onToggle={() => setDiagnosticsOpen((v) => !v)}
          onOpenMetric={openMetric}
        />
      </div>

      <footer className="dashboard-footer">
        <span>6h sparklines · polls every 30s · Enter or click a card for detail</span>
        <button
          type="button"
          className="refresh-btn"
          onClick={() => void refresh()}
          disabled={fetching}
        >
          Refresh now
        </button>
      </footer>

      {profileOpen && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileOpen(false);
          }}
        >
          <aside
            className="profile-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-drawer-title"
          >
            <header className="drawer-header">
              <h2 id="profile-drawer-title">Plant profile</h2>
              <button
                type="button"
                className="refresh-btn"
                onClick={() => setProfileOpen(false)}
              >
                Close
              </button>
            </header>
            <PlantProfileSection
              deviceId={deviceId}
              cropType={cropType}
              lifecycleStage={lifecycleStage}
              seasonStartDate={seasonStartDate}
              onProfileSaved={(nextCrop, nextStage, nextSeason) => {
                setCropType(nextCrop);
                setLifecycleStage(nextStage);
                if (nextSeason !== undefined) setSeasonStartDate(nextSeason);
                onProfileChanged();
                setProfileOpen(false);
                void refresh();
              }}
            />
          </aside>
        </div>
      )}

      {logEventOpen && (
        <LogEventForm
          deviceName={DEVICE_NAME}
          onClose={() => setLogEventOpen(false)}
          onSaved={() => {
            void refreshEvents();
            onEventsChanged();
          }}
        />
      )}

      {detailMetric && (
        <MetricDetailModal
          metricKey={detailMetric}
          range={detailRange}
          onRangeChange={onDetailRangeChange}
          deviceCropType={cropType}
          deviceLifecycleStage={lifecycleStage}
          eventsEpoch={eventsEpoch}
          onEventsChanged={onEventsChanged}
          onClose={onCloseMetric}
        />
      )}
    </div>
  );
}

/** Pick a History range that includes the event timestamp. */
function historyRangeForEvent(occurredAt: string): RangePreset {
  const ageMs = Date.now() - new Date(occurredAt).getTime();
  if (ageMs <= 24 * 60 * 60 * 1000) return "24h";
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return "7d";
  return "30d";
}
