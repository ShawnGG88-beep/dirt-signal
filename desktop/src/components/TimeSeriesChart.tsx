import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SensorReading } from "../lib/api";
import { getScoringSemantic } from "../lib/growingConstants";
import {
  effectiveReadingProfile,
  getMetricBoundsForProfile,
  profileSegmentKey,
  type MetricBounds,
  type MetricKey,
} from "../lib/metrics";

interface TimeSeriesChartProps {
  readings: SensorReading[];
  metricKey: MetricKey;
  colour?: string;
  height?: number;
  compact?: boolean;
  /** Device current profile: fallback when reading provenance is null. */
  deviceCropType?: string;
  deviceLifecycleStage?: string;
  /** When true, segment at profile changeovers and draw per-segment bands. */
  segmentByProfile?: boolean;
}

export interface ProfileSegment {
  id: number;
  key: string;
  cropType: string;
  lifecycleStage: string;
  label: string;
  provenanceKnown: boolean;
  bounds: MetricBounds | null;
  scoringSemantic: string;
  startAt: string;
  endAt: string;
}

function formatTick(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTooltipTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface AnnotatedPoint {
  recorded_at: string;
  value: number;
  segmentId: number;
  provenanceKnown: boolean;
}

/** Build contiguous segments and annotate each reading with its segment id. */
export function annotateProfileSegments(
  readings: SensorReading[],
  metricKey: MetricKey,
  deviceCropType: string,
  deviceLifecycleStage: string,
): { segments: ProfileSegment[]; points: AnnotatedPoint[] } {
  const sorted = [...readings]
    .filter((r) => r[metricKey] !== null && r[metricKey] !== undefined)
    .sort(
      (a, b) =>
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );

  const segments: ProfileSegment[] = [];
  const points: AnnotatedPoint[] = [];

  for (const reading of sorted) {
    const eff = effectiveReadingProfile(
      reading,
      deviceCropType,
      deviceLifecycleStage,
    );
    const key = profileSegmentKey(eff.cropType, eff.lifecycleStage);
    const last = segments[segments.length - 1];
    if (
      last &&
      last.key === key &&
      last.provenanceKnown === eff.provenanceKnown
    ) {
      last.endAt = reading.recorded_at;
    } else {
      segments.push({
        id: segments.length,
        key,
        cropType: eff.cropType,
        lifecycleStage: eff.lifecycleStage,
        label: `${eff.cropType}/${eff.lifecycleStage}`,
        provenanceKnown: eff.provenanceKnown,
        bounds: getMetricBoundsForProfile(
          metricKey,
          eff.cropType,
          eff.lifecycleStage,
        ),
        scoringSemantic: getScoringSemantic(eff.cropType, eff.lifecycleStage),
        startAt: reading.recorded_at,
        endAt: reading.recorded_at,
      });
    }
    points.push({
      recorded_at: reading.recorded_at,
      value: reading[metricKey] as number,
      segmentId: segments[segments.length - 1].id,
      provenanceKnown: eff.provenanceKnown,
    });
  }

  return { segments, points };
}

const SEGMENT_COLOURS = ["#2DB500", "#107EEC", "#FF8A00", "#c0c0c0"];

export function TimeSeriesChart({
  readings,
  metricKey,
  colour = "#2DB500",
  height = 280,
  compact = false,
  deviceCropType = "tomato",
  deviceLifecycleStage = "mature",
  segmentByProfile = false,
}: TimeSeriesChartProps) {
  const { segments, points } = annotateProfileSegments(
    readings,
    metricKey,
    deviceCropType,
    deviceLifecycleStage,
  );

  if (points.length === 0) {
    return (
      <div className="chart-empty" style={{ height }}>
        No data in this range
      </div>
    );
  }

  const multiSegment = segmentByProfile && segments.length > 1;

  const chartData = multiSegment
    ? points.map((point) => {
        const row: Record<string, string | number | boolean | null> = {
          recorded_at: point.recorded_at,
          provenanceKnown: point.provenanceKnown,
        };
        for (const seg of segments) {
          row[`seg_${seg.id}`] =
            point.segmentId === seg.id ? point.value : null;
        }
        return row;
      })
    : points.map((point) => ({
        recorded_at: point.recorded_at,
        value: point.value,
        provenanceKnown: point.provenanceKnown,
      }));

  const seriesKeys = multiSegment
    ? segments.map((s) => `seg_${s.id}`)
    : ["value"];

  const showBands = segmentByProfile && segments.some((s) => s.bounds !== null);

  const singleBounds = !multiSegment
    ? segmentByProfile
      ? (segments[0]?.bounds ?? null)
      : getMetricBoundsForProfile(
          metricKey,
          deviceCropType,
          deviceLifecycleStage,
        )
    : null;

  const hasUnknownProvenance = points.some((p) => !p.provenanceKnown);

  return (
    <div className="chart-wrap" style={{ height, width: "100%" }}>
      {segmentByProfile && multiSegment && !compact && (
        <div className="chart-segment-labels">
          {segments.map((seg, i) => (
            <span
              key={`label-${seg.id}`}
              className="chart-segment-label"
              style={{ color: SEGMENT_COLOURS[i % SEGMENT_COLOURS.length] }}
            >
              {seg.label}
              {!seg.provenanceKnown ? " (profile unknown)" : ""}
            </span>
          ))}
        </div>
      )}
      {segmentByProfile && hasUnknownProvenance && !multiSegment && !compact && (
        <p className="chart-provenance-note">
          Profile unknown for this period
        </p>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={
            compact
              ? { top: 4, right: 4, left: 0, bottom: 0 }
              : { top: 8, right: 12, left: 4, bottom: 4 }
          }
        >
          <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
          <XAxis
            dataKey="recorded_at"
            tickFormatter={formatTick}
            stroke="#555"
            tick={{ fill: "#888", fontSize: compact ? 9 : 11 }}
            minTickGap={compact ? 40 : 60}
            hide={compact}
          />
          <YAxis
            stroke="#555"
            tick={{ fill: "#888", fontSize: compact ? 9 : 11 }}
            width={compact ? 36 : 48}
            domain={["auto", "auto"]}
          />
          {!compact && (
            <Tooltip
              contentStyle={{
                background: "#0a0a0a",
                border: "1px solid #1a1a1a",
                fontFamily: "inherit",
                fontSize: 12,
              }}
              labelStyle={{ color: "#888" }}
              itemStyle={{ color: colour }}
              labelFormatter={(label) => formatTooltipTime(String(label))}
              formatter={(value) => [
                typeof value === "number" ? value.toFixed(2) : String(value),
                "value",
              ]}
            />
          )}

          {showBands &&
            segments.map((seg, i) =>
              seg.bounds ? (
                <ReferenceArea
                  key={`band-${seg.id}`}
                  x1={seg.startAt}
                  x2={seg.endAt}
                  y1={seg.bounds.min}
                  y2={seg.bounds.max}
                  fill={
                    seg.scoringSemantic === "restraint"
                      ? "#FF8A00"
                      : SEGMENT_COLOURS[i % SEGMENT_COLOURS.length]
                  }
                  fillOpacity={0.08}
                  strokeOpacity={0}
                />
              ) : null,
            )}

          {!showBands && singleBounds && (
            <ReferenceArea
              y1={singleBounds.min}
              y2={singleBounds.max}
              fill={
                segments[0]?.scoringSemantic === "restraint"
                  ? "#FF8A00"
                  : "#2DB500"
              }
              fillOpacity={0.08}
              strokeOpacity={0}
            />
          )}

          {seriesKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={
                multiSegment
                  ? SEGMENT_COLOURS[i % SEGMENT_COLOURS.length]
                  : colour
              }
              strokeWidth={compact ? 1.25 : 1.75}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
