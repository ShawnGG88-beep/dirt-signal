import { useEffect, useMemo, useState } from "react";
import {
  fetchLatestAdvisoryDigest,
  fetchDailyAggregates,
  fetchEvents,
  fetchReadingsRange,
} from "../data/client";
import type { DailyAdvisoryDigestResponse } from "../data/types";
import {
  HISTORY_FETCH_LIMIT,
  type DailyAggregateRow,
  type PlantEvent,
  type SensorReading,
} from "../data/types";
import { buildDailySummaries } from "../lib/dailySummary";
import { DEFAULT_DEVICE_TIMEZONE, localDayKey } from "../lib/dayNight";
import { useSelectedDeviceName } from "../lib/device";
import {
  eventTypeColour,
  eventTypeGlyph,
  eventTypeLabel,
} from "../lib/eventTypes";
import {
  DEFAULT_CROP_TYPE,
  DEFAULT_LIFECYCLE_STAGE,
  TOMATO_GDD_STAGE_BANDS_PROVENANCE,
  WINKLER_INDEX_NOT_PHENOLOGY_NOTE,
  getCropStage,
  getGrapeWineCultivarProfile,
  getGrapeWineGddProvenance,
  getScoringSemantic,
  isGrapeCrop,
  SAMPLING_LIMITATIONS,
} from "../lib/growingConstants";
import { formatGrapeWineStageLine, formatTomatoStageLine } from "../lib/phenology";
import {
  formatMetricValue,
  rangeFromPreset,
  type RangePreset,
} from "../lib/metrics";
import { ExportButton } from "../components/ExportButton";
import { RangePicker } from "../components/RangePicker";

const VPD_LIMITATION = SAMPLING_LIMITATIONS[3];
const HUMIDITY_LIMITATION = SAMPLING_LIMITATIONS[4];

interface ReportsProps {
  profileEpoch: number;
  eventsEpoch?: number;
  range: RangePreset;
  onRangeChange: (range: RangePreset) => void;
}

function formatDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRange(
  min: number | null,
  max: number | null,
  unit: string,
): string {
  if (min === null || max === null) return "n/a";
  const lo = formatMetricValue(min, "", 2);
  const hi = formatMetricValue(max, "", 2);
  const suffix = unit ? ` ${unit}` : "";
  return `${lo} to ${hi}${suffix}`;
}

function groupEventsByDay(
  events: PlantEvent[],
  timeZone: string,
): Map<string, PlantEvent[]> {
  const map = new Map<string, PlantEvent[]>();
  for (const event of events) {
    const key = localDayKey(event.occurred_at, timeZone);
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  return map;
}

function summariseIrrigation(events: PlantEvent[]): {
  count: number;
  volumeMl: number | null;
} {
  const irrigations = events.filter((e) => e.event_type === "irrigation");
  let volume = 0;
  let hasVolume = false;
  for (const event of irrigations) {
    if (event.quantity != null) {
      volume += event.quantity;
      hasVolume = true;
    }
  }
  return {
    count: irrigations.length,
    volumeMl: hasVolume ? volume : null,
  };
}

export function Reports({
  profileEpoch,
  eventsEpoch = 0,
  range: preset,
  onRangeChange,
}: ReportsProps) {
  const deviceName = useSelectedDeviceName();
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [dailyRows, setDailyRows] = useState<DailyAggregateRow[]>([]);
  const [events, setEvents] = useState<PlantEvent[]>([]);
  const [cropType, setCropType] = useState<string>(DEFAULT_CROP_TYPE);
  const [lifecycleStage, setLifecycleStage] = useState<string>(
    DEFAULT_LIFECYCLE_STAGE,
  );
  const [timeZone, setTimeZone] = useState(DEFAULT_DEVICE_TIMEZONE);
  const [seasonStartDate, setSeasonStartDate] = useState<string | null>(null);
  const [cultivar, setCultivar] = useState<string | null>(null);
  const [cumulativeGdd, setCumulativeGdd] = useState<number | null>(null);
  const [daysElapsed, setDaysElapsed] = useState<number | null>(null);
  const [daysExcluded, setDaysExcluded] = useState(0);
  const [gddUnavailableReason, setGddUnavailableReason] = useState<
    string | null
  >(null);
  const [advisories, setAdvisories] =
    useState<DailyAdvisoryDigestResponse | null>(null);
  const [advisoriesError, setAdvisoriesError] = useState<string | null>(null);
  const [from, setFrom] = useState(() => rangeFromPreset(preset).from);
  const [to, setTo] = useState(() => rangeFromPreset(preset).to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { from: nextFrom, to: nextTo } = rangeFromPreset(preset);
    setFrom(nextFrom);
    setTo(nextTo);
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [aggregates, eventsResult, range] = await Promise.all([
          fetchDailyAggregates(nextFrom, nextTo, deviceName),
          fetchEvents({
            deviceName,
            fromAt: nextFrom,
            toAt: nextTo,
            limit: 2000,
          }),
          fetchReadingsRange(
            nextFrom,
            nextTo,
            deviceName,
            HISTORY_FETCH_LIMIT,
          ),
        ]);
        if (!cancelled) {
          setDailyRows(aggregates.days);
          setEvents(eventsResult.events);
          setReadings(range.readings);
          setCropType(aggregates.crop_type ?? DEFAULT_CROP_TYPE);
          setLifecycleStage(
            aggregates.lifecycle_stage ?? DEFAULT_LIFECYCLE_STAGE,
          );
          setTimeZone(aggregates.timezone ?? DEFAULT_DEVICE_TIMEZONE);
          setSeasonStartDate(aggregates.season_start_date);
          setCultivar(aggregates.cultivar ?? null);
          setCumulativeGdd(aggregates.cumulative_gdd);
          setDaysElapsed(aggregates.days_elapsed);
          setDaysExcluded(aggregates.days_excluded);
          setGddUnavailableReason(
            aggregates.cumulative_gdd_unavailable_reason,
          );
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report");
          setDailyRows([]);
          setEvents([]);
          setReadings([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [preset, profileEpoch, eventsEpoch, deviceName]);

  useEffect(() => {
    let cancelled = false;
    async function loadAdvisories() {
      try {
        const result = await fetchLatestAdvisoryDigest(deviceName);
        if (!cancelled) {
          setAdvisories(result);
          setAdvisoriesError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setAdvisories(null);
          setAdvisoriesError(
            err instanceof Error ? err.message : "Advisories unavailable",
          );
        }
      }
    }
    void loadAdvisories();
    return () => {
      cancelled = true;
    };
  }, [deviceName, profileEpoch]);

  const metricSummaries = useMemo(
    () =>
      buildDailySummaries(readings, {
        cropType,
        lifecycleStage,
        timeZone,
      }),
    [readings, cropType, lifecycleStage, timeZone],
  );

  const summariesByDay = useMemo(
    () => new Map(metricSummaries.map((s) => [s.day, s])),
    [metricSummaries],
  );

  const eventsByDay = useMemo(
    () => groupEventsByDay(events, timeZone),
    [events, timeZone],
  );

  const irrigationSummary = useMemo(
    () => summariseIrrigation(events),
    [events],
  );

  const scoringSemantic = getScoringSemantic(cropType, lifecycleStage);
  const stage = getCropStage(cropType, lifecycleStage);
  const showGrapeLimitations = isGrapeCrop(cropType);
  const cultivarProfile = getGrapeWineCultivarProfile(
    cropType === "grape_wine" ? cultivar : null,
  );

  const sortedDays = useMemo(
    () => [...dailyRows].sort((a, b) => b.day.localeCompare(a.day)),
    [dailyRows],
  );

  return (
    <div className="view-page">
      <header className="view-header">
        <div>
          <h1>Reports</h1>
          <p className="subtitle">
            Daily digest · device-local days ({timeZone}) · flags against{" "}
            {cropType}/{lifecycleStage} reference (
            {scoringSemantic === "restraint"
              ? "restraint scoring: elevated readings mean excess vigour risk"
              : "optimal-band scoring"}
            )
          </p>
        </div>
        <div className="view-toolbar">
          <RangePicker value={preset} onChange={onRangeChange} />
          <ExportButton
            readings={readings}
            events={events}
            from={from}
            to={to}
            prefix="dirt-signal-report"
          />
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="view-status">Loading…</p>}

      {advisories?.digest && (
        <section className="reports-advisories">
          <h2>Weather advisories</h2>
          <p className="muted">
            Last computed{" "}
            {advisories.computed_at
              ? new Date(advisories.computed_at).toLocaleString("en-GB")
              : new Date(advisories.digest.evaluated_at).toLocaleString("en-GB")}
          </p>
          <ul>
            <li>{advisories.digest.spray_window.message}</li>
            <li>{advisories.digest.capture_suggestion.note}</li>
            {cropType === "tomato" && advisories.digest.tomato && (
              <>
                <li>
                  {(advisories.digest.tomato.chill as { message?: string })?.message ??
                    "Chill assessment unavailable"}
                </li>
                <li>
                  {(advisories.digest.tomato.moisture as { headline?: string })
                    ?.headline ?? "Moisture stability unavailable"}
                </li>
              </>
            )}
          </ul>
        </section>
      )}
      {!loading && !advisories?.digest && !advisoriesError && (
        <section className="reports-advisories">
          <h2>Weather advisories</h2>
          <p className="muted">
            Advisories sync has not run yet. Invoke the{" "}
            <code>advisories-daily-sync</code> Edge Function to populate
            precomputed weather advisories.
          </p>
        </section>
      )}
      {advisoriesError && !advisories && (
        <p className="muted view-status">{advisoriesError}</p>
      )}

      {!loading && sortedDays.length > 0 && (
        <section className="reports-season-summary">
          <h2>Season summary</h2>
          <dl className="reports-season-dl">
            <div>
              <dt>Cumulative degree days</dt>
              <dd>
                {gddUnavailableReason === "no_season_start" ||
                seasonStartDate == null ? (
                  "Set season start in plant profile"
                ) : cumulativeGdd != null ? (
                  <>
                    {cumulativeGdd.toFixed(1)} °C·d
                    {cropType === "grape_wine" ? (
                      <>
                        {" "}
                        · current stage:{" "}
                        {formatGrapeWineStageLine(cumulativeGdd, cultivar)}
                        <span
                          className="dashboard-gdd-note"
                          title={getGrapeWineGddProvenance(cultivar)}
                        >
                          {" "}
                          ({getGrapeWineGddProvenance(cultivar)})
                        </span>
                      </>
                    ) : null}
                    {cropType === "tomato" ? (
                      <>
                        {" "}
                        · GDD-inferred stage:{" "}
                        {formatTomatoStageLine(cumulativeGdd)}
                        <span
                          className="dashboard-gdd-note"
                          title={TOMATO_GDD_STAGE_BANDS_PROVENANCE}
                        >
                          {" "}
                          ({TOMATO_GDD_STAGE_BANDS_PROVENANCE})
                        </span>
                      </>
                    ) : null}
                    <span className="dashboard-gdd-note">
                      {" "}
                      (device degree days — not field GDD)
                    </span>
                  </>
                ) : (
                  "n/a"
                )}
              </dd>
            </div>
            <div>
              <dt>Season window</dt>
              <dd>
                {daysElapsed != null
                  ? `${daysElapsed}d elapsed · ${daysExcluded}d excluded (sparse coverage)`
                  : "n/a"}
              </dd>
            </div>
            {cropType === "grape_wine" ? (
              <>
                <div>
                  <dt>Cultivar</dt>
                  <dd>
                    {cultivarProfile
                      ? cultivarProfile.display_name
                      : "Not set (shared GDD bands)"}
                  </dd>
                </div>
                {cultivarProfile ? (
                  <>
                    <div>
                      <dt>Winkler region</dt>
                      <dd>
                        {cultivarProfile.winkler_region_label}
                        <span
                          className="dashboard-gdd-note"
                          title={WINKLER_INDEX_NOT_PHENOLOGY_NOTE}
                        >
                          {" "}
                          (site-suitability context; not phenology GDD)
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Water-stress reference</dt>
                      <dd>
                        {cultivarProfile.water_stress.metric_type ===
                        "leaf_water_potential_gs50" &&
                        cultivarProfile.water_stress.psi_mpa != null ? (
                          <>
                            Psi_gs50 = {cultivarProfile.water_stress.psi_mpa} ±{" "}
                            {cultivarProfile.water_stress.psi_mpa_plus_minus}{" "}
                            {cultivarProfile.water_stress.units} (
                            {cultivarProfile.water_stress.metric_type}).{" "}
                            {cultivarProfile.water_stress.note}
                          </>
                        ) : null}
                        {cultivarProfile.water_stress.metric_type ===
                        "stem_water_potential" &&
                        cultivarProfile.water_stress.stages ? (
                          <>
                            Psi_stem stage table ({cultivarProfile.water_stress.metric_type}
                            ):{" "}
                            {cultivarProfile.water_stress.stages
                              .map(
                                (row) =>
                                  `${row.phenological_stage} ${row.psi_stem_mpa} MPa`,
                              )
                              .join("; ")}
                            . {cultivarProfile.water_stress.note}
                          </>
                        ) : null}
                        {cultivarProfile.water_stress.open_gap
                          ? cultivarProfile.water_stress.note
                          : null}
                      </dd>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            <div>
              <dt>Irrigation</dt>
              <dd>
                {irrigationSummary.count} event
                {irrigationSummary.count === 1 ? "" : "s"}
                {irrigationSummary.volumeMl != null
                  ? ` · ${irrigationSummary.volumeMl.toFixed(0)} ml total`
                  : ""}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {!loading && sortedDays.length === 0 && (
        <p className="view-status">No readings in this range</p>
      )}

      {!loading && sortedDays.length > 0 && (
        <div className="reports-list">
          {sortedDays.map((row) => {
            const summary = summariesByDay.get(row.day);
            const dayEvents = eventsByDay.get(row.day) ?? [];
            return (
              <section
                key={row.day}
                className={
                  row.incomplete
                    ? "report-day report-day-incomplete"
                    : "report-day"
                }
              >
                <div className="report-day-header">
                  <h2>
                    {formatDayLabel(row.day)}
                    {row.incomplete && (
                      <span className="report-incomplete-badge">
                        incomplete
                      </span>
                    )}
                  </h2>
                  {summary?.hasFlags ? (
                    scoringSemantic === "restraint" ? (
                      <span className="elevated-badge">elevated</span>
                    ) : (
                      <span className="flag-badge">out of bounds</span>
                    )
                  ) : (
                    <span className="ok-badge">
                      {scoringSemantic === "restraint"
                        ? "within watch band"
                        : "within bounds"}
                    </span>
                  )}
                </div>

                <div className="report-derived-stats">
                  <span>
                    GDD{" "}
                    {row.gdd_day != null
                      ? `${row.gdd_day.toFixed(1)} °C·d`
                      : "n/a"}
                  </span>
                  <span className="muted">·</span>
                  <span title={HUMIDITY_LIMITATION}>
                    High humidity{" "}
                    {row.high_humidity_hours}h
                    <span className="muted">
                      {" "}
                      (coverage {row.coverage_hours.toFixed(0)}h)
                    </span>
                  </span>
                  <span className="muted">·</span>
                  <span title={VPD_LIMITATION}>
                    VPD mean{" "}
                    {formatMetricValue(row.vpd_kpa_mean, "kPa", 2)}
                  </span>
                </div>

                <div className="report-day-events">
                  <span className="report-day-events-label">Events</span>
                  {dayEvents.length === 0 ? (
                    <span className="muted-cell">none</span>
                  ) : (
                    <span className="report-event-glyphs">
                      {summariseDayEventGlyphs(dayEvents).map((item) => (
                        <span
                          key={item.key}
                          className="report-event-glyph"
                          style={{ color: item.colour }}
                          title={`${item.count}× ${item.label}`}
                        >
                          <span aria-hidden="true">{item.glyph}</span>
                          {item.count > 1 && (
                            <span className="report-event-count">
                              {item.count}
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                {summary && (
                  <div className="table-scroll">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Mean</th>
                          <th>Range</th>
                          <th>n</th>
                          <th>Reference</th>
                          <th>Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.metrics.map((m) => (
                          <tr
                            key={m.key}
                            className={
                              m.elevated
                                ? "row-elevated"
                                : m.outOfBounds
                                  ? "row-flagged"
                                  : undefined
                            }
                          >
                            <td>{m.label}</td>
                            <td>{formatMetricValue(m.mean, m.unit, 2)}</td>
                            <td>{formatRange(m.min, m.max, m.unit)}</td>
                            <td>{m.count}</td>
                            <td className="ref-cell">{m.referenceLabel}</td>
                            <td>
                              {!m.flaggable ? (
                                <span className="muted-cell">n/a</span>
                              ) : m.elevated ? (
                                <span
                                  className="elevated-dot"
                                  title="Elevated: excess vigour risk, not a deficiency"
                                >
                                  ↑
                                </span>
                              ) : m.outOfBounds ? (
                                <span className="flag-dot" title="Outside bounds">
                                  !
                                </span>
                              ) : (
                                <span className="muted-cell">ok</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <section className="reports-derived-caveats">
        <h2>Derived metric caveats</h2>
        <ul>
          <li className="metric-caveat">{VPD_LIMITATION}</li>
          <li className="metric-caveat">{HUMIDITY_LIMITATION}</li>
        </ul>
      </section>

      {showGrapeLimitations && (
        <section className="reports-limitations">
          <h2>Sampling limitations</h2>
          <ul>
            {SAMPLING_LIMITATIONS.map((item) => (
              <li key={item.slice(0, 48)}>{item}</li>
            ))}
          </ul>
          {stage.unmeasurable_but_dominant?.note && (
            <p className="reports-limitation-extra">
              {stage.unmeasurable_but_dominant.note}
            </p>
          )}
          {stage.scale_incompatibility_warning && (
            <p className="reports-limitation-extra">
              {stage.scale_incompatibility_warning}
            </p>
          )}
          {scoringSemantic === "restraint" && (
            <p className="reports-limitation-extra">
              Scoring semantic is restraint: values above the reference band
              indicate excess vigour risk, not deficiency. Never recommend
              increasing nitrogen for this device.
            </p>
          )}
        </section>
      )}

      <footer className="reports-footer">
        <p>
          Bounds from <code>ml-backend/constants.py</code>{" "}
          <code>CROP_PROFILES</code> (mirrored in{" "}
          <code>shared/src/lib/growingConstants.ts</code>). Profile: {cropType}/
          {lifecycleStage}
          {cultivarProfile ? `/${cultivarProfile.display_name}` : ""}. Metrics without a band for this profile show raw
          values only. Ambient uses day (06:00-18:00) and night ranges
          separately when the stage defines them. N/P/K estimates are shown
          without pass/fail until calibrated against soil-test ground truth.
          Events are annotation context only and do not affect scoring.
          Degree-day totals use device-local calendar days from{" "}
          <code>/readings/daily-aggregates</code> — indoor device degree days,
          not Winkler or field GDD.
          {scoringSemantic === "restraint"
            ? " Under restraint, nitrogen advice never recommends an increase."
            : ""}
        </p>
      </footer>
    </div>
  );
}

function summariseDayEventGlyphs(
  events: PlantEvent[],
): { key: string; glyph: string; colour: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.event_type, (counts.get(event.event_type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({
    key,
    glyph: eventTypeGlyph(key),
    colour: eventTypeColour(key),
    label: eventTypeLabel(key),
    count,
  }));
}
