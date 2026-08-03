import type { MetricStatus } from "@dirt-signal/shared";

interface StatusIndicatorProps {
  label: string;
  status: MetricStatus;
  detail?: string;
  /** When true, show glyph + text label for the status (a11y). */
  showStatusText?: boolean;
}

/** Distinct glyph per status so colour is never the sole carrier. */
export const STATUS_GLYPH: Record<MetricStatus, string> = {
  ok: "✓",
  watch: "◎",
  warn: "!",
  elevated: "↑",
  error: "✕",
  unknown: "?",
};

export const STATUS_TEXT: Record<MetricStatus, string> = {
  ok: "ok",
  watch: "watch",
  warn: "out of bounds",
  elevated: "elevated",
  error: "error",
  unknown: "unknown",
};

export function StatusIndicator({
  label,
  status,
  detail,
  showStatusText = false,
}: StatusIndicatorProps) {
  return (
    <div className={`status-indicator status-${status}`}>
      <span className="status-glyph" aria-hidden="true">
        {STATUS_GLYPH[status]}
      </span>
      {label && <span className="status-label">{label}</span>}
      {showStatusText && (
        <span className="status-text">{STATUS_TEXT[status]}</span>
      )}
      {detail && <span className="status-detail">{detail}</span>}
    </div>
  );
}
