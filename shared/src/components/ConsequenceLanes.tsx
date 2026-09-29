import type { WeatherForecastHour } from "../data/types";
import {
  ProvisionalBadge,
  ShadowModeBadge,
} from "./SemanticStatus";
import {
  laneSegmentFrac,
  type ConsequenceLane,
  type ConsequenceLanesResult,
} from "../lib/consequenceLanes";

export interface ConsequenceLanesProps {
  result: ConsequenceLanesResult;
  hours: WeatherForecastHour[];
  /** Day keys for 7-day layout (forecast_date). */
  dayKeys?: string[];
}

function SparklineBars({
  values,
}: {
  values: Array<number | null>;
}) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const max = Math.max(0.01, ...finite);
  return (
    <div className="consequence-lane-spark" aria-hidden="true">
      {values.map((v, i) => {
        const h = v == null ? 0 : (v / max) * 100;
        return (
          <span
            key={i}
            className="consequence-lane-spark-bar"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

function LaneTrack({
  lane,
  hours,
  dayKeys,
}: {
  lane: ConsequenceLane;
  hours: WeatherForecastHour[];
  dayKeys?: string[];
}) {
  const useDays =
    lane.granularity === "daily" && dayKeys != null && dayKeys.length > 0;

  return (
    <div
      className={`consequence-lane is-${lane.pattern} is-${lane.kind}`}
      data-lane-kind={lane.kind}
    >
      <div className="consequence-lane-meta">
        <span className="consequence-lane-title">{lane.title}</span>
        {lane.shadowMode ? <ShadowModeBadge /> : null}
        {lane.provisional ? <ProvisionalBadge /> : null}
      </div>
      <div
        className="consequence-lane-track"
        role="img"
        tabIndex={0}
        aria-label={lane.summary}
      >
        {lane.pattern === "sparkline" && lane.sparkline ? (
          <SparklineBars values={lane.sparkline} />
        ) : useDays ? (
          <div className="consequence-lane-days">
            {dayKeys!.map((day) => {
              const hit = lane.segments.some((seg) =>
                seg.start.startsWith(day) ||
                seg.end.startsWith(day) ||
                (seg.label != null && seg.start.includes(day)),
              );
              // Match by calendar day key in segment bounds.
              const active = lane.segments.some((seg) => {
                const s = seg.start.slice(0, 10);
                const e = seg.end.slice(0, 10);
                return day >= s && day <= e;
              });
              return (
                <span
                  key={day}
                  className={
                    active || hit
                      ? "consequence-lane-day-tag is-active"
                      : "consequence-lane-day-tag"
                  }
                  title={active || hit ? lane.segments[0]?.label : undefined}
                />
              );
            })}
          </div>
        ) : (
          <div className="consequence-lane-hours">
            {lane.segments.map((seg) => {
              const left = laneSegmentFrac(seg.start, hours);
              const right = laneSegmentFrac(seg.end, hours);
              if (left == null || right == null) return null;
              const width = Math.max(0.02, right - left);
              return (
                <span
                  key={`${seg.start}-${seg.end}`}
                  className="consequence-lane-segment"
                  style={{
                    left: `${left * 100}%`,
                    width: `${width * 100}%`,
                  }}
                  title={seg.label ?? lane.title}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Generic consequence lane list. New advisory kinds render without changes
 * as long as they supply pattern + segments via buildConsequenceLanes.
 */
export function ConsequenceLanes({
  result,
  hours,
  dayKeys,
}: ConsequenceLanesProps) {
  if (hours.length === 0 && result.lanes.length === 0) {
    return null;
  }

  return (
    <div className="consequence-lanes" aria-label="Consequence lanes">
      {result.nothingToActOn ? (
        <p className="consequence-lanes-clear muted">Nothing to act on</p>
      ) : null}
      {result.lanes.map((lane) => (
        <LaneTrack
          key={lane.id}
          lane={lane}
          hours={hours}
          dayKeys={dayKeys}
        />
      ))}
    </div>
  );
}
