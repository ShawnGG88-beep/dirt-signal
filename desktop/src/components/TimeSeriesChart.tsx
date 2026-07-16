import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SensorReading } from "../lib/api";
import type { MetricKey } from "../lib/metrics";

interface TimeSeriesChartProps {
  readings: SensorReading[];
  metricKey: MetricKey;
  colour?: string;
  height?: number;
  compact?: boolean;
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

export function TimeSeriesChart({
  readings,
  metricKey,
  colour = "#2DB500",
  height = 280,
  compact = false,
}: TimeSeriesChartProps) {
  const data = readings
    .filter((r) => r[metricKey] !== null && r[metricKey] !== undefined)
    .map((r) => ({
      recorded_at: r.recorded_at,
      value: r[metricKey] as number,
    }));

  if (data.length === 0) {
    return (
      <div className="chart-empty" style={{ height }}>
        No data in this range
      </div>
    );
  }

  return (
    <div className="chart-wrap" style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
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
          <Line
            type="monotone"
            dataKey="value"
            stroke={colour}
            strokeWidth={compact ? 1.25 : 1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
