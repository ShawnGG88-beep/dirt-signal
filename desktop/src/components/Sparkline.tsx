import type { MetricBounds } from "../lib/metrics";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  colour?: string;
  /** When set, shade the profile band behind the trace. */
  bounds?: MetricBounds | null;
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  colour = "#2DB500",
  bounds = null,
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#333"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      </svg>
    );
  }

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const extentMin =
    bounds != null ? Math.min(dataMin, bounds.min) : dataMin;
  const extentMax =
    bounds != null ? Math.max(dataMax, bounds.max) : dataMax;
  const range = extentMax - extentMin || 1;
  const step = width / (values.length - 1);

  const yFor = (value: number) =>
    height - ((value - extentMin) / range) * (height - 4) - 2;

  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = yFor(value);
      return `${x},${y}`;
    })
    .join(" ");

  let bandRect: { y: number; h: number } | null = null;
  if (bounds) {
    const yTop = yFor(bounds.max);
    const yBottom = yFor(bounds.min);
    bandRect = { y: yTop, h: Math.max(1, yBottom - yTop) };
  }

  return (
    <svg width={width} height={height} aria-hidden="true">
      {bandRect && (
        <rect
          x={0}
          y={bandRect.y}
          width={width}
          height={bandRect.h}
          fill={colour}
          opacity={0.12}
        />
      )}
      <polyline
        fill="none"
        stroke={colour}
        strokeWidth={1.5}
        points={points}
      />
    </svg>
  );
}
