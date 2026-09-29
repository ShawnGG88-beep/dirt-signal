import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion } from "motion/react";
import type {
  DailyAdvisoryDigestPayload,
  WeatherForecastDay,
  WeatherForecastHour,
  WeatherForecastResponse,
} from "../data/types";
import { ConsequenceLanes } from "./ConsequenceLanes";
import { GlassPanel } from "./GlassPanel";
import {
  SemanticStatusBadge,
} from "./SemanticStatus";
import { usePrefersReducedMotion } from "../lib/accessibility";
import { buildConsequenceLanes } from "../lib/consequenceLanes";
import {
  formatDeviceClock,
  formatDeviceDay,
  formatDeviceDateTime,
  formatUpdatedAgo,
} from "../lib/formatTime";
import {
  HOUR_DETAIL_VT_NAME,
  runViewTransition,
} from "../lib/viewTransition";
import {
  aggregateForecastDays,
  digestIsStale,
  findSunForHour,
  forecastIsStale,
  hourReadouts,
  pickCurrentHourIndex,
  skyBandGradient,
  sliceHorizonHours,
  weatherCodeLabel,
} from "../lib/weatherHorizon";

export type HorizonRange = "48h" | "7d";

export interface WeatherHorizonProps {
  forecast: WeatherForecastResponse | null;
  loading?: boolean;
  error?: string | null;
  /** Greenhouse DHT22 ambient temperature (°C). */
  insideTempC?: number | null;
  /** Precomputed device_advisories_daily digest (spray / frost). */
  advisoryDigest?: DailyAdvisoryDigestPayload | null;
  /** When the advisory digest was last computed (ISO). */
  advisoryComputedAt?: string | null;
  timeZone: string;
  onRetry?: () => void;
}

function fmtTemp(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(1)}°`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value)}%`;
}

function fmtWind(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(0)} km/h`;
}

function fmtKpa(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)} kPa`;
}

function fmtMm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(1)} mm`;
}

function hourAriaLabel(
  hour: WeatherForecastHour,
  timeZone: string,
): string {
  const clock = formatDeviceClock(hour.forecast_time, { timeZone });
  const temp = fmtTemp(hour.temperature_2m);
  const rain = fmtPct(hour.precipitation_probability);
  return `${clock}, ${temp}, rain chance ${rain}`;
}

export function WeatherHorizon({
  forecast,
  loading = false,
  error = null,
  insideTempC = null,
  advisoryDigest = null,
  advisoryComputedAt = null,
  timeZone,
  onRetry,
}: WeatherHorizonProps) {
  const labelId = useId();
  const summaryId = useId();
  const [range, setRange] = useState<HorizonRange>("48h");
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [drawerHour, setDrawerHour] = useState<WeatherForecastHour | null>(
    null,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const reduceMotion = usePrefersReducedMotion();
  const dragging = useRef(false);
  const bandRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const hours48 = useMemo(() => {
    if (!forecast) return [] as WeatherForecastHour[];
    return sliceHorizonHours(forecast.hours, 48, nowMs);
  }, [forecast, nowMs]);

  const days7 = useMemo(() => {
    if (!forecast) return [];
    return aggregateForecastDays(
      sliceHorizonHours(forecast.hours, 168, nowMs),
      forecast.days,
      timeZone,
    ).slice(0, 7);
  }, [forecast, nowMs, timeZone]);

  const bandHours = hours48;
  const nowIndex = useMemo(
    () => pickCurrentHourIndex(bandHours, nowMs),
    [bandHours, nowMs],
  );

  const activeIndex =
    scrubIndex != null && scrubIndex >= 0 && scrubIndex < bandHours.length
      ? scrubIndex
      : nowIndex;

  const activeHour =
    activeIndex >= 0 ? bandHours[activeIndex] ?? null : null;

  const activeSun = useMemo(() => {
    if (!activeHour || !forecast) {
      return { sunrise_at: null, sunset_at: null };
    }
    return findSunForHour(activeHour.forecast_time, forecast.days, timeZone);
  }, [activeHour, forecast, timeZone]);

  const readouts = hourReadouts(activeHour, activeSun);

  const skyGradient = useMemo(() => {
    if (!forecast) return "var(--sky-night)";
    return skyBandGradient(
      bandHours.map((hour) => {
        const sun = findSunForHour(
          hour.forecast_time,
          forecast.days,
          timeZone,
        );
        return {
          forecast_time: hour.forecast_time,
          cloud_cover: hour.cloud_cover,
          sunrise_at: sun.sunrise_at,
          sunset_at: sun.sunset_at,
        };
      }),
    );
  }, [bandHours, forecast, timeZone]);

  const laneHours = useMemo(() => {
    if (!forecast) return [] as WeatherForecastHour[];
    return range === "48h"
      ? hours48
      : sliceHorizonHours(forecast.hours, 168, nowMs);
  }, [forecast, range, hours48, nowMs]);

  const consequence = useMemo(
    () =>
      buildConsequenceLanes({
        digest: advisoryDigest,
        hours: laneHours,
        timeZone,
        aggregateDaily: range === "7d",
      }),
    [advisoryDigest, laneHours, timeZone, range],
  );

  const stale = forecastIsStale(forecast?.fetched_at, nowMs);
  const digestStale = digestIsStale(advisoryComputedAt, nowMs);
  const outsideTemp = readouts?.temperature_2m ?? null;
  const delta =
    insideTempC != null &&
    outsideTemp != null &&
    Number.isFinite(insideTempC) &&
    Number.isFinite(outsideTemp)
      ? insideTempC - outsideTemp
      : null;

  const clearScrub = useCallback(() => {
    dragging.current = false;
    setScrubIndex(null);
  }, []);

  const openHourDetail = useCallback(
    (hour: WeatherForecastHour, index: number) => {
      const btn = bandRef.current?.querySelector(
        `[data-hour-index="${index}"]`,
      ) as HTMLElement | null;
      if (btn) btn.style.viewTransitionName = HOUR_DETAIL_VT_NAME;
      void runViewTransition(() => {
        setDrawerHour(hour);
      }).finally(() => {
        if (btn) btn.style.viewTransitionName = "";
      });
    },
    [],
  );

  const closeHourDetail = useCallback(() => {
    const panel = document.querySelector(
      ".weather-horizon-drawer",
    ) as HTMLElement | null;
    if (panel) panel.style.viewTransitionName = HOUR_DETAIL_VT_NAME;
    void runViewTransition(() => {
      setDrawerHour(null);
    }).finally(() => {
      if (panel) panel.style.viewTransitionName = "";
    });
  }, []);

  const indexFromClientX = useCallback(
    (clientX: number) => {
      const el = bandRef.current;
      if (!el || bandHours.length === 0) return 0;
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const i = Math.floor((x / rect.width) * bandHours.length);
      return Math.min(bandHours.length - 1, Math.max(0, i));
    },
    [bandHours.length],
  );

  function onBandPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (range !== "48h") return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setScrubIndex(indexFromClientX(e.clientX));
  }

  function onBandPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current || range !== "48h") return;
    setScrubIndex(indexFromClientX(e.clientX));
  }

  function onBandPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragging.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
    clearScrub();
  }

  function onHourKeyDown(
    e: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next =
        e.key === "ArrowRight"
          ? Math.min(bandHours.length - 1, index + 1)
          : Math.max(0, index - 1);
      setScrubIndex(next);
      const buttons = bandRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-hour-index]",
      );
      buttons?.[next]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setScrubIndex(0);
      bandRef.current
        ?.querySelectorAll<HTMLButtonElement>("[data-hour-index]")[0]
        ?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = bandHours.length - 1;
      setScrubIndex(last);
      bandRef.current
        ?.querySelectorAll<HTMLButtonElement>("[data-hour-index]")[last]
        ?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setDrawerHour(bandHours[index] ?? null);
    } else if (e.key === "Escape") {
      clearScrub();
    }
  }

  const temps = bandHours
    .map((h) => h.temperature_2m)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const tMin = temps.length ? Math.min(...temps) : 0;
  const tMax = temps.length ? Math.max(...temps) : 1;
  const tSpan = Math.max(0.1, tMax - tMin);

  const precipMax = Math.max(
    0.1,
    ...bandHours.map((h) => h.precipitation ?? 0),
  );

  const summaryText = useMemo(() => {
    if (!forecast || !readouts) {
      return "Weather horizon unavailable.";
    }
    const when = formatDeviceDateTime(activeHour!.forecast_time, {
      timeZone,
    });
    const laneLines = consequence.lanes.map((lane) => lane.summary);
    const parts = [
      `Forecast for ${when}.`,
      `Outside ${fmtTemp(readouts.temperature_2m)}.`,
      insideTempC != null
        ? `Inside greenhouse ${fmtTemp(insideTempC)}.`
        : null,
      `Rain chance ${fmtPct(readouts.precipitation_probability)}.`,
      `Wind ${fmtWind(readouts.wind_speed_10m)}, gusts ${fmtWind(readouts.wind_gusts_10m)}.`,
      `Humidity ${fmtPct(readouts.relative_humidity_2m)}, dew point ${fmtTemp(readouts.dew_point_c)}.`,
      `Vapour pressure deficit ${fmtKpa(readouts.vpd_kpa)}.`,
      `Water use (ET0) ${fmtMm(readouts.et0_fao_evapotranspiration)}.`,
      ...laneLines,
      consequence.nothingToActOn ? "Nothing to act on." : null,
      stale ? "Forecast is stale." : null,
      advisoryComputedAt
        ? digestStale
          ? "Advisory digest is stale."
          : null
        : "Advisory digest unavailable.",
    ];
    return parts.filter(Boolean).join(" ");
  }, [
    forecast,
    readouts,
    activeHour,
    timeZone,
    insideTempC,
    consequence.lanes,
    consequence.nothingToActOn,
    stale,
    digestStale,
    advisoryComputedAt,
  ]);

  const readoutClass = reduceMotion
    ? "weather-horizon-readouts is-instant"
    : "weather-horizon-readouts";

  return (
    <GlassPanel
      layer={2}
      as="section"
      className="weather-horizon"
      aria-labelledby={labelId}
      aria-describedby={summaryId}
    >
      <div className="weather-horizon-header">
        <div>
          <h2 id={labelId} className="weather-horizon-title">
            Weather horizon
          </h2>
          <p className="weather-horizon-fresh muted">
            {forecast?.fetched_at
              ? `Forecast updated ${formatUpdatedAgo(forecast.fetched_at, nowMs).replace(/^Updated /, "")}`
              : "Forecast not loaded"}
            {stale ? (
              <>
                {" · "}
                <SemanticStatusBadge status="stale" label="Stale" />
              </>
            ) : null}
          </p>
          <p className="weather-horizon-fresh muted">
            {advisoryComputedAt
              ? `Advisories updated ${formatUpdatedAgo(advisoryComputedAt, nowMs).replace(/^Updated /, "")}`
              : "Advisories not loaded"}
            {advisoryComputedAt && digestStale ? (
              <>
                {" · "}
                <SemanticStatusBadge status="stale" label="Stale" />
              </>
            ) : null}
          </p>
        </div>
        <div
          className="weather-horizon-toggle"
          role="group"
          aria-label="Horizon range"
        >
          <button
            type="button"
            className={range === "48h" ? "is-active" : undefined}
            aria-pressed={range === "48h"}
            onClick={() => {
              setRange("48h");
              clearScrub();
            }}
          >
            48 hour
          </button>
          <button
            type="button"
            className={range === "7d" ? "is-active" : undefined}
            aria-pressed={range === "7d"}
            onClick={() => {
              setRange("7d");
              clearScrub();
            }}
          >
            7 day
          </button>
        </div>
      </div>

      <p id={summaryId} className="weather-horizon-summary">
        {summaryText}
      </p>

      {error && (
        <div className="error-banner" role="alert">
          {error}
          {onRetry ? (
            <>
              {" "}
              <button type="button" className="link-btn" onClick={onRetry}>
                Retry
              </button>
            </>
          ) : null}
        </div>
      )}

      {loading && !forecast && (
        <div
          className="weather-horizon-skeleton"
          aria-busy="true"
          aria-label="Loading forecast"
        >
          <div className="skeleton weather-horizon-skeleton-hero" />
          <div className="skeleton weather-horizon-skeleton-band" />
          <div className="skeleton weather-horizon-skeleton-lane" />
        </div>
      )}

      {forecast && (
        <>
          <div className="weather-horizon-hero">
            <div className="weather-horizon-hero-temps">
              <p
                key={activeHour?.forecast_time ?? "none"}
                className={
                  reduceMotion
                    ? "weather-horizon-hero-outside font-hero is-instant"
                    : "weather-horizon-hero-outside font-hero"
                }
              >
                {fmtTemp(outsideTemp)}
              </p>
              <p className="weather-horizon-hero-compare muted">
                Outside
                {insideTempC != null ? (
                  <>
                    {" · "}
                    Inside {fmtTemp(insideTempC)}
                    {delta != null
                      ? ` (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}°)`
                      : null}
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <div
            key={`readouts-${activeHour?.forecast_time ?? "none"}`}
            className={readoutClass}
            aria-live="polite"
          >
            <Readout label="Rain chance" value={fmtPct(readouts?.precipitation_probability)} />
            <Readout
              label="Wind"
              value={`${fmtWind(readouts?.wind_speed_10m)} · gusts ${fmtWind(readouts?.wind_gusts_10m)}`}
            />
            <Readout
              label="Humidity"
              value={`${fmtPct(readouts?.relative_humidity_2m)} · dew ${fmtTemp(readouts?.dew_point_c)}`}
            />
            <Readout label="VPD" value={fmtKpa(readouts?.vpd_kpa)} />
            <Readout
              label="Water use (ET0)"
              value={fmtMm(readouts?.et0_fao_evapotranspiration)}
            />
          </div>

          {range === "48h" ? (
            <motion.div
              key="band-48h"
              ref={bandRef}
              className="weather-horizon-band"
              role="group"
              aria-label="48 hour sky band"
              onPointerDown={onBandPointerDown}
              onPointerMove={onBandPointerMove}
              onPointerUp={onBandPointerUp}
              onPointerCancel={clearScrub}
              onPointerLeave={() => {
                if (!dragging.current) clearScrub();
              }}
              initial={
                reduceMotion ? false : { opacity: 0.7, scaleX: 0.97 }
              }
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{
                duration: reduceMotion ? 0.1 : 0.4,
                ease: [0.45, 0, 0.55, 1],
              }}
            >
              <div
                className="weather-horizon-sky"
                aria-hidden="true"
                style={{ background: skyGradient }}
              />

              <svg
                className="weather-horizon-overlays"
                viewBox={`0 0 ${Math.max(1, bandHours.length)} 100`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {bandHours.map((hour, i) => {
                  const precip = hour.precipitation ?? 0;
                  const h = (precip / precipMax) * 28;
                  return (
                    <rect
                      key={`p-${hour.forecast_time}`}
                      x={i + 0.15}
                      y={0}
                      width={0.7}
                      height={h}
                      fill="var(--sky-precip)"
                      opacity={0.55}
                    />
                  );
                })}
                <polyline
                  fill="none"
                  stroke="var(--sky-temp-line)"
                  strokeWidth={0.08}
                  vectorEffect="non-scaling-stroke"
                  points={bandHours
                    .map((hour, i) => {
                      const t = hour.temperature_2m;
                      if (t == null) return "";
                      const y = 88 - ((t - tMin) / tSpan) * 55;
                      return `${i + 0.5},${y}`;
                    })
                    .filter(Boolean)
                    .join(" ")}
                />
                {renderSunPath(bandHours, forecast.days, timeZone)}
                {nowIndex >= 0 ? (
                  <line
                    x1={nowIndex + 0.5}
                    x2={nowIndex + 0.5}
                    y1={0}
                    y2={100}
                    stroke="var(--sky-now-marker)"
                    strokeWidth={0.06}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>

              <div className="weather-horizon-hours" role="list">
                {bandHours.map((hour, index) => (
                  <button
                    key={hour.forecast_time}
                    type="button"
                    role="listitem"
                    data-hour-index={index}
                    className={
                      index === activeIndex
                        ? "weather-horizon-hour is-active"
                        : "weather-horizon-hour"
                    }
                    aria-label={hourAriaLabel(hour, timeZone)}
                    aria-pressed={index === activeIndex}
                    onFocus={() => setScrubIndex(index)}
                    onBlur={(e) => {
                      const next = e.relatedTarget;
                      if (
                        next instanceof Node &&
                        bandRef.current?.contains(next)
                      ) {
                        return;
                      }
                      if (!dragging.current) clearScrub();
                    }}
                    onMouseEnter={() => setScrubIndex(index)}
                    onKeyDown={(e) => onHourKeyDown(e, index)}
                    onClick={() => openHourDetail(hour, index)}
                  >
                    <span className="visually-hidden">
                      {hourAriaLabel(hour, timeZone)}
                    </span>
                  </button>
                ))}
              </div>

              <div className="weather-horizon-axis" aria-hidden="true">
                {bandHours.map((hour, index) =>
                  index % 6 === 0 ? (
                    <span
                      key={`ax-${hour.forecast_time}`}
                      style={{
                        left: `${((index + 0.5) / bandHours.length) * 100}%`,
                      }}
                    >
                      {formatDeviceClock(hour.forecast_time, { timeZone })}
                    </span>
                  ) : null,
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="band-7d"
              className="weather-horizon-days"
              role="list"
              initial={
                reduceMotion ? false : { opacity: 0.7, scaleX: 0.97 }
              }
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{
                duration: reduceMotion ? 0.1 : 0.4,
                ease: [0.45, 0, 0.55, 1],
              }}
            >
              {days7.map((day) => (
                <div
                  key={day.forecast_date}
                  className="weather-horizon-day"
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${formatDeviceDay(`${day.forecast_date}T12:00:00Z`, {
                    timeZone,
                  })}, high ${fmtTemp(day.high_c)}, low ${fmtTemp(day.low_c)}, rain ${fmtPct(day.rain_chance_max)}`}
                >
                  <div
                    className="weather-horizon-day-swatch"
                    style={{ background: day.sky_css }}
                    aria-hidden="true"
                  />
                  <p className="weather-horizon-day-label">
                    {formatDeviceDay(`${day.forecast_date}T12:00:00Z`, {
                      timeZone,
                    })}
                  </p>
                  <p className="weather-horizon-day-temps">
                    {fmtTemp(day.high_c)} / {fmtTemp(day.low_c)}
                  </p>
                  <p className="muted">
                    Rain {fmtPct(day.rain_chance_max)} · ET0{" "}
                    {fmtMm(day.et0_sum)}
                  </p>
                </div>
              ))}
            </motion.div>
          )}

          <ConsequenceLanes
            result={consequence}
            hours={laneHours}
            dayKeys={
              range === "7d" ? days7.map((d) => d.forecast_date) : undefined
            }
          />
        </>
      )}

      {drawerHour ? (
        <HourDetailDrawer
          hour={drawerHour}
          days={forecast?.days ?? []}
          timeZone={timeZone}
          onClose={closeHourDetail}
        />
      ) : null}
    </GlassPanel>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="weather-horizon-readout">
      <span className="weather-horizon-readout-label">{label}</span>
      <span className="weather-horizon-readout-value">{value}</span>
    </div>
  );
}

function renderSunPath(
  hours: WeatherForecastHour[],
  days: WeatherForecastDay[],
  timeZone: string,
) {
  if (hours.length === 0) return null;
  const points: string[] = [];
  for (let i = 0; i < hours.length; i += 1) {
    const hour = hours[i];
    const sun = findSunForHour(hour.forecast_time, days, timeZone);
    if (!sun.sunrise_at || !sun.sunset_at) continue;
    const t = new Date(hour.forecast_time).getTime();
    const rise = new Date(sun.sunrise_at).getTime();
    const set = new Date(sun.sunset_at).getTime();
    if (t < rise || t > set) continue;
    const frac = (t - rise) / Math.max(1, set - rise);
    const y = 70 - Math.sin(Math.PI * frac) * 42;
    points.push(`${i + 0.5},${y}`);
  }
  if (points.length < 2) return null;
  return (
    <polyline
      fill="none"
      stroke="var(--sky-sun-path)"
      strokeWidth={0.05}
      strokeDasharray="0.2 0.15"
      vectorEffect="non-scaling-stroke"
      points={points.join(" ")}
    />
  );
}

function HourDetailDrawer({
  hour,
  days,
  timeZone,
  onClose,
}: {
  hour: WeatherForecastHour;
  days: WeatherForecastDay[];
  timeZone: string;
  onClose: () => void;
}) {
  const sun = findSunForHour(hour.forecast_time, days, timeZone);
  const readouts = hourReadouts(hour, sun);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();

    function focusable(): HTMLElement[] {
      const root = panelRef.current;
      if (!root) return [];
      return [
        ...root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusable();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="weather-horizon-drawer-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="glass-l3 weather-horizon-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ viewTransitionName: HOUR_DETAIL_VT_NAME }}
      >
        <div className="weather-horizon-drawer-header">
          <h3 id={titleId}>
            {formatDeviceDateTime(hour.forecast_time, { timeZone })}
          </h3>
          <button
            ref={closeRef}
            type="button"
            className="weather-horizon-drawer-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <dl className="weather-horizon-drawer-grid">
          <dt>Temperature</dt>
          <dd>{fmtTemp(readouts?.temperature_2m)}</dd>
          <dt>Rain chance</dt>
          <dd>{fmtPct(readouts?.precipitation_probability)}</dd>
          <dt>Precipitation</dt>
          <dd>{fmtMm(readouts?.precipitation)}</dd>
          <dt>Wind / gusts</dt>
          <dd>
            {fmtWind(readouts?.wind_speed_10m)} /{" "}
            {fmtWind(readouts?.wind_gusts_10m)}
          </dd>
          <dt>Humidity / dew</dt>
          <dd>
            {fmtPct(readouts?.relative_humidity_2m)} /{" "}
            {fmtTemp(readouts?.dew_point_c)}
          </dd>
          <dt>VPD</dt>
          <dd>{fmtKpa(readouts?.vpd_kpa)}</dd>
          <dt>Water use (ET0)</dt>
          <dd>{fmtMm(readouts?.et0_fao_evapotranspiration)}</dd>
          <dt>Cloud cover</dt>
          <dd>{fmtPct(readouts?.cloud_cover)}</dd>
          <dt>Conditions</dt>
          <dd>{weatherCodeLabel(readouts?.weather_code)}</dd>
          <dt>CAPE</dt>
          <dd>
            {readouts?.cape != null && Number.isFinite(readouts.cape)
              ? `${Math.round(readouts.cape)} J/kg`
              : "-"}
          </dd>
          <dt>Daylight</dt>
          <dd>{readouts?.is_day ? "Day" : "Night"}</dd>
          <dt>Sunrise</dt>
          <dd>
            {sun.sunrise_at
              ? formatDeviceClock(sun.sunrise_at, { timeZone })
              : "-"}
          </dd>
          <dt>Sunset</dt>
          <dd>
            {sun.sunset_at
              ? formatDeviceClock(sun.sunset_at, { timeZone })
              : "-"}
          </dd>
        </dl>
      </div>
    </div>
  );
}
