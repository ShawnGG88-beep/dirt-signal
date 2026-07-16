interface StatusIndicatorProps {
  label: string;
  status: "ok" | "warn" | "elevated" | "error" | "unknown";
  detail?: string;
}

const STATUS_COLOURS: Record<StatusIndicatorProps["status"], string> = {
  ok: "#2DB500",
  warn: "#FF8A00",
  elevated: "#FF8A00",
  error: "#ff4444",
  unknown: "#555555",
};

export function StatusIndicator({ label, status, detail }: StatusIndicatorProps) {
  return (
    <div className="status-indicator">
      <span
        className="status-dot"
        style={{ backgroundColor: STATUS_COLOURS[status] }}
        aria-hidden="true"
      />
      <span className="status-label">{label}</span>
      {detail && <span className="status-detail">{detail}</span>}
    </div>
  );
}
