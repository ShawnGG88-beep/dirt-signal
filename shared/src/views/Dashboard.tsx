import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  fetchDailyAggregates,
  fetchEvents,
  fetchHealth,
  fetchLatestAdvisoryDigest,
  fetchLatestReading,
  fetchReadingsRange,
  fetchWeatherForecast,
} from "../data/client";
import {
  staleAfterMsFromInterval,
  type DailyAdvisoryDigestPayload,
  type DeviceSensorModeFields,
  type PlantEvent,
  type SensorReading,
  type WeatherForecastResponse,
} from "../data/types";
import { DashboardStatusSentence } from "../components/DashboardStatusSentence";
import { LogEventForm } from "../components/LogEventForm";
import { MetricDetailModal } from "../components/MetricDetailModal";
import { NeedsAttention } from "../components/NeedsAttention";
import { PlantProfileSection } from "../components/PlantProfileSection";
import { SensorTile } from "../components/SensorTile";
import { formatRelativeAge, SystemStatusLine } from "../components/SystemStatusLine";
import { WeatherHorizon } from "../components/WeatherHorizon";
import {
  attentionClausesFromLanes,
  buildNeedsAttentionItems,
  buildStatusSentence,
  sparklineIsSteady,
} from "../lib/dashboardStatus";
import { buildConsequenceLanes } from "../lib/consequenceLanes";
import { DEFAULT_DEVICE_TIMEZONE } from "../lib/dayNight";
import { useSelectedDeviceName } from "../lib/device";
import {
  dewPointC,
  projectDrydown,
  vapourPressureDeficitKpa,
} from "../lib/derived";
import { eventTypeLabel } from "../lib/eventTypes";
import {
  DEFAULT_CROP_TYPE,
  DEFAULT_LIFECYCLE_STAGE,
  TOMATO_GDD_STAGE_BANDS_PROVENANCE,
  getGrapeWineGddProvenance,
  getScoringSemantic,
} from "../lib/growingConstants";
import { formatGrapeWineStageLine, formatTomatoStageLine } from "../lib/phenology";
import {
  getMetricBoundsForProfile,
  METRICS,
  scoreMetricForProfile,
  type MetricDef,
  type MetricKey,
  type MetricScore,
  type RangePreset,
  type SoilMoistureAnchors,
} from "../lib/metrics";
import { metricIsSimulated } from "../lib/sensorModes";
import { useAlertPoll } from "../lib/useAlertPoll";
import { usePrefersReducedMotion } from "../lib/accessibility";
import {
  runViewTransition,
  SENSOR_DETAIL_VT_NAME,
} from "../lib/viewTransition";
import { sliceHorizonHours } from "../lib/weatherHorizon";

const POLL_MS = 30_000;
const SPARK_HOURS = 24;
const SPARK_FETCH_LIMIT = 500;
const VPD_LIMITATION = "Air VPD · leaf≈air assumption";
const ENTER_SESSION_KEY = "dirt-signal-dashboard-enter-done";

/** Physical + derived streams shown as sensor tiles (not diagnostics). */
const TILE_METRICS: MetricDef[] = METRICS.filter(
  (m) => m.tier === "primary" || m.tier === "context",
);

function scoreForCard(
  key: MetricKey,
  value: number | null | undefined,
  cropType: string,
  lifecycleStage: string,
  recordedAt: string | null | undefined,
  timeZone: string,
  derived: boolean | undefined,
  anchors: SoilMoistureAnchors | null,
): MetricScore {
  return scoreMetricForProfile(
    key,
    value,
    cropType,
    lifecycleStage,
    recordedAt,
    timeZone,
    { derived, anchors },
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
        <span className="diagnostics-hint">display only, not scored</span>
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
              {raw === null || raw === undefined ? "-" : String(raw)}
            </span>
          </button>
          <div className="diagnostics-item diagnostics-item-static">
            <span className="diagnostics-item-label">EC µS/cm</span>
            <span className="diagnostics-item-value tabular-nums">
              {ec === null ? "-" : String(ec)}
            </span>
          </div>
          <div className="diagnostics-item diagnostics-item-static">
            <span className="diagnostics-item-label">N est.</span>
            <span className="diagnostics-item-value tabular-nums">
              {n === null ? "-" : String(n)}
            </span>
          </div>
          <div className="diagnostics-item diagnostics-item-static">
            <span className="diagnostics-item-label">P est.</span>
            <span className="diagnostics-item-value tabular-nums">
              {p === null ? "-" : String(p)}
            </span>
          </div>
          <div className="diagnostics-item diagnostics-item-static">
            <span className="diagnostics-item-label">K est.</span>
            <span className="diagnostics-item-value tabular-nums">
              {k === null ? "-" : String(k)}
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
  const deviceName = useSelectedDeviceName();
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
  const [soilTexture, setSoilTexture] = useState<string | null>("loam");
  const [cultivar, setCultivar] = useState<string | null>(null);
  const [soilAnchors, setSoilAnchors] = useState<SoilMoistureAnchors | null>(
    null,
  );
  const [sensorModes, setSensorModes] = useState<DeviceSensorModeFields>({});
  const [cumulativeGdd, setCumulativeGdd] = useState<number | null>(null);
  const [gddDaysExcluded, setGddDaysExcluded] = useState(0);
  const [gddUnavailable, setGddUnavailable] = useState<string | null>(
    "no_season_start",
  );
  const [drydownLine, setDrydownLine] = useState<string | null>(null);
  const { openNotifyCount, worstNotifySeverity } = useAlertPoll();
  const reduceMotion = usePrefersReducedMotion();
  const [enterActive, setEnterActive] = useState(() => {
    if (typeof sessionStorage === "undefined") return false;
    try {
      return sessionStorage.getItem(ENTER_SESSION_KEY) !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!enterActive) return;
    document.documentElement.setAttribute("data-dashboard-enter", "true");
    const ms = reduceMotion ? 0 : 900;
    const t = setTimeout(() => {
      document.documentElement.removeAttribute("data-dashboard-enter");
      setEnterActive(false);
      try {
        sessionStorage.setItem(ENTER_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
    }, ms);
    return () => {
      clearTimeout(t);
      document.documentElement.removeAttribute("data-dashboard-enter");
    };
  }, [enterActive, reduceMotion]);
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
  const [weatherForecast, setWeatherForecast] =
    useState<WeatherForecastResponse | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [advisoryDigest, setAdvisoryDigest] =
    useState<DailyAdvisoryDigestPayload | null>(null);
  const [advisoryComputedAt, setAdvisoryComputedAt] = useState<string | null>(
    null,
  );
  const returnFocusEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshRange = useCallback(async () => {
    try {
      const range = await fetchReadingsRange(
        new Date(Date.now() - SPARK_HOURS * 60 * 60 * 1000),
        new Date(),
        deviceName,
        SPARK_FETCH_LIMIT,
      );
      setHistory(range.readings);
      setRangeError(null);
    } catch (err) {
      setRangeError(
        err instanceof Error ? err.message : "Failed to fetch range",
      );
    }
  }, [deviceName]);

  const refreshEvents = useCallback(async () => {
    try {
      const result = await fetchEvents({
        deviceName,
        limit: 5,
      });
      setRecentEvents(result.events);
    } catch {
      // Keep prior list; events are orientation, not critical path.
    }
  }, [deviceName]);

  const refreshWeather = useCallback(async () => {
    setWeatherLoading(true);
    try {
      const result = await fetchWeatherForecast(deviceName, 168);
      setWeatherForecast(result);
      setWeatherError(null);
    } catch (err) {
      setWeatherError(
        err instanceof Error ? err.message : "Failed to load weather forecast",
      );
    } finally {
      setWeatherLoading(false);
    }
  }, [deviceName]);

  const refreshAdvisories = useCallback(async () => {
    try {
      const result = await fetchLatestAdvisoryDigest(deviceName);
      setAdvisoryDigest(result.digest ?? null);
      setAdvisoryComputedAt(result.computed_at ?? null);
    } catch {
      // Digest lanes are additive; keep prior digest on failure.
    }
  }, [deviceName]);

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

    const latestPromise = fetchLatestReading(deviceName);

    const latestTask = latestPromise
      .then((latest) => {
        setReading(latest.reading);
        setDeviceId(latest.device_id ?? latest.reading?.device_id ?? null);
        setCropType(latest.crop_type ?? DEFAULT_CROP_TYPE);
        setLifecycleStage(latest.lifecycle_stage ?? DEFAULT_LIFECYCLE_STAGE);
        setTimeZone(latest.timezone ?? DEFAULT_DEVICE_TIMEZONE);
        setSeasonStartDate(latest.season_start_date ?? null);
        setSoilTexture(latest.soil_texture ?? "loam");
        setCultivar(latest.cultivar ?? null);
        setSoilAnchors({
          fieldCapacityPct: latest.soil_field_capacity_raw ?? null,
          refillPointPct: latest.soil_refill_point_raw ?? null,
        });
        setSensorModes({
          moisture_mode: latest.moisture_mode ?? null,
          ph_mode: latest.ph_mode ?? null,
          ds18b20_mode: latest.ds18b20_mode ?? null,
          dht22_mode: latest.dht22_mode ?? null,
          npk_mode: latest.npk_mode ?? null,
        });
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
      deviceName,
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
        deviceName,
        500,
      ),
      fetchEvents({
        deviceName,
        fromAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
        toAt: new Date(),
        limit: 200,
      }),
      latestPromise,
    ])
      .then(([range, eventsRes, latest]) => {
        const crop = latest.crop_type ?? DEFAULT_CROP_TYPE;
        const stage = latest.lifecycle_stage ?? DEFAULT_LIFECYCLE_STAGE;
        const bounds = getMetricBoundsForProfile("moisture_pct", crop, stage);
        const refill = latest.soil_refill_point_raw;
        const fc = latest.soil_field_capacity_raw;
        const moistureLowerBound =
          bounds?.min ??
          (typeof refill === "number" &&
          typeof fc === "number" &&
          fc > refill
            ? refill
            : null);
        const result = projectDrydown(range.readings, eventsRes.events, {
          moistureLowerBound,
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
    const weatherTask = refreshWeather();
    const advisoriesTask = refreshAdvisories();

    await Promise.allSettled([
      healthTask,
      latestTask,
      rangeTask,
      eventsTask,
      gddTask,
      drydownTask,
      weatherTask,
      advisoriesTask,
    ]);
    setLastPollAt(new Date());
    setFetching(false);
  }, [deviceName, refreshRange, refreshEvents, refreshWeather, refreshAdvisories]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    }, POLL_MS);
    function onVisibilityChange() {
      if (!document.hidden) void refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
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

  function openMetric(key: MetricKey) {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      returnFocusEl.current = active;
    }
    const tile = document.querySelector<HTMLElement>(
      `[data-sensor-tile="${key}"]`,
    );
    if (tile) {
      tile.style.viewTransitionName = SENSOR_DETAIL_VT_NAME;
    }
    void runViewTransition(() => {
      flushSync(() => {
        onOpenMetric(key);
      });
    }).finally(() => {
      if (tile) tile.style.viewTransitionName = "";
    });
  }

  function closeMetric() {
    const drawer = document.querySelector<HTMLElement>(
      ".metric-detail-drawer",
    );
    const tileKey = detailMetric;
    const tile =
      tileKey != null
        ? document.querySelector<HTMLElement>(
            `[data-sensor-tile="${tileKey}"]`,
          )
        : null;
    if (drawer) {
      drawer.style.viewTransitionName = SENSOR_DETAIL_VT_NAME;
    }
    void runViewTransition(() => {
      flushSync(() => {
        onCloseMetric();
      });
      if (tile) {
        tile.style.viewTransitionName = SENSOR_DETAIL_VT_NAME;
      }
    }).finally(() => {
      if (tile) tile.style.viewTransitionName = "";
      if (drawer) drawer.style.viewTransitionName = "";
    });
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

  const scoredTiles = useMemo(() => {
    function valueOf(key: MetricKey): number | null | undefined {
      if (key === "vpd_kpa") {
        return vapourPressureDeficitKpa(
          reading?.ambient_temp_c,
          reading?.ambient_humidity_pct,
        );
      }
      if (key === "dew_point_c") {
        return dewPointC(
          reading?.ambient_temp_c,
          reading?.ambient_humidity_pct,
        );
      }
      return reading?.[key as keyof SensorReading] as
        | number
        | null
        | undefined;
    }

    return TILE_METRICS.map((metric) => {
      const value = valueOf(metric.key);
      const score = scoreForCard(
        metric.key,
        value,
        cropType,
        lifecycleStage,
        reading?.recorded_at,
        timeZone,
        metric.derived,
        soilAnchors,
      );
      return { metric, value, score };
    });
  }, [reading, cropType, lifecycleStage, timeZone, soilAnchors]);

  const consequence = useMemo(() => {
    const hours = weatherForecast
      ? sliceHorizonHours(weatherForecast.hours, 48, nowMs)
      : [];
    return buildConsequenceLanes({
      digest: advisoryDigest,
      hours,
      timeZone,
      aggregateDaily: false,
    });
  }, [weatherForecast, advisoryDigest, timeZone, nowMs]);

  const needsAttention = useMemo(
    () =>
      buildNeedsAttentionItems({
        metrics: scoredTiles.map((t) => ({
          key: t.metric.key,
          label: t.metric.label,
          score: t.score,
          isNull: t.value === null || t.value === undefined,
          recordedAt: reading?.recorded_at ?? null,
        })),
        lanes: consequence.lanes,
        nowMs,
        staleAfterMs,
      }),
    [scoredTiles, consequence.lanes, reading?.recorded_at, nowMs, staleAfterMs],
  );

  const moistureSpark = sparkFor("moisture_pct");
  const moistureSteady = sparklineIsSteady(moistureSpark);
  const statusSentence = buildStatusSentence({
    metricLabels: TILE_METRICS.map((m) => m.label),
    reportingCount: scoredTiles.filter(
      (t) => t.value !== null && t.value !== undefined,
    ).length,
    moistureSteady,
    attentionClauses: attentionClausesFromLanes(consequence.lanes, timeZone),
  });

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

  const gddProvisional =
    cropType === "grape_wine" || cropType === "tomato";

  const seasonDetail = (
    <>
      {gddUnavailable === "no_season_start" || seasonStartDate == null ? (
        <>
          Degree days unavailable.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => setProfileOpen(true)}
          >
            Set season start
          </button>
        </>
      ) : (
        <>
          {cumulativeGdd != null ? `${cumulativeGdd.toFixed(0)} °C·d` : "-"} ·{" "}
          {gddDaysElapsed}d since season start
          {gddDaysExcluded > 0
            ? ` · ${gddDaysExcluded}d excluded (sparse)`
            : ""}
          {cropType === "grape_wine" && cumulativeGdd != null ? (
            <>
              {" "}
              · current stage: {formatGrapeWineStageLine(cumulativeGdd, cultivar)}{" "}
              <span title={getGrapeWineGddProvenance(cultivar)}>
                ({getGrapeWineGddProvenance(cultivar)})
              </span>
            </>
          ) : null}
          {cropType === "tomato" && cumulativeGdd != null ? (
            <>
              {" "}
              · GDD-inferred stage: {formatTomatoStageLine(cumulativeGdd)}{" "}
              <span title={TOMATO_GDD_STAGE_BANDS_PROVENANCE}>
                ({TOMATO_GDD_STAGE_BANDS_PROVENANCE})
              </span>
            </>
          ) : null}
          <span title="Indoor degree days under artificial light are not comparable to field GDD / Winkler.">
            {" "}
            (device degree days)
          </span>
        </>
      )}
    </>
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Dirt Signal</h1>
          <DashboardStatusSentence
            sentence={statusSentence}
            detail={seasonDetail}
            gddProvisional={gddProvisional && cumulativeGdd != null}
          />
        </div>
        <SystemStatusLine
          sidecarReachable={sidecarReachable}
          healthOk={healthOk}
          deviceName={deviceName}
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

      {fetching && !reading ? (
        <div
          className="dashboard-skeleton"
          aria-busy="true"
          aria-label="Loading readings"
        >
          <div className="skeleton dashboard-skeleton-horizon" />
          <div className="sensor-tile-grid" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton dashboard-skeleton-tile" />
            ))}
          </div>
        </div>
      ) : null}

      {latestError && !reading && (
        <div className="error-banner">{latestError}</div>
      )}

      <div
        className={[
          "dashboard-content",
          fetching ? "is-fetching" : "",
          enterActive && !reduceMotion ? "is-entering" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <WeatherHorizon
          forecast={weatherForecast}
          loading={weatherLoading}
          error={weatherError}
          insideTempC={reading?.ambient_temp_c ?? null}
          advisoryDigest={advisoryDigest}
          advisoryComputedAt={advisoryComputedAt}
          timeZone={timeZone}
          onRetry={() => void refreshWeather()}
        />

        <NeedsAttention
          items={needsAttention}
          onSelectMetric={(key) => openMetric(key as MetricKey)}
        />

        <section className="sensor-tile-grid" aria-label="Sensor tiles">
          {scoredTiles.map(({ metric, value, score }) => (
            <div key={metric.key} className="sensor-tile-wrap">
              <SensorTile
                metric={metric}
                value={value}
                score={score}
                sparkValues={sparkFor(metric.key)}
                scoringSemantic={semantic}
                recordedAt={reading?.recorded_at ?? null}
                nowMs={nowMs}
                staleAfterMs={staleAfterMs}
                fetching={fetching}
                rangeError={rangeError}
                onRetryRange={() => void refreshRange()}
                onOpen={() => openMetric(metric.key)}
                simulated={metricIsSimulated(metric.key, sensorModes)}
                footnote={
                  metric.key === "moisture_pct" && drydownLine
                    ? drydownLine
                    : metric.derived && metric.key === "vpd_kpa"
                      ? VPD_LIMITATION
                      : metric.derived
                        ? "Derived from greenhouse air"
                        : null
                }
              />
            </div>
          ))}
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
        <span>
          24h sparklines · polls every 30s · Enter or click a tile for detail
        </span>
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
              soilTexture={soilTexture}
              cultivar={cultivar}
              onProfileSaved={(
                nextCrop: string,
                nextStage: string,
                nextSeason?: string | null,
                nextTexture?: string | null,
                nextCultivar?: string | null,
              ) => {
                setCropType(nextCrop);
                setLifecycleStage(nextStage);
                if (nextSeason !== undefined) setSeasonStartDate(nextSeason);
                if (nextTexture !== undefined) setSoilTexture(nextTexture);
                if (nextCultivar !== undefined) setCultivar(nextCultivar);
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
          deviceName={deviceName}
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
          onClose={closeMetric}
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
