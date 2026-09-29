import type { ReactNode } from "react";

/**
 * Semantic status for the Cellar redesign.
 * Colour is never the sole carrier: every state has icon + text.
 */
export type SemanticStatus = "ok" | "watch" | "act" | "cold" | "stale";

const STATUS_LABEL: Record<SemanticStatus, string> = {
  ok: "Within range",
  watch: "Watch",
  act: "Act now",
  cold: "Cold",
  stale: "Stale",
};

function StatusIcon({ status }: { status: SemanticStatus }): ReactNode {
  const common = {
    className: "semantic-status-icon",
    viewBox: "0 0 16 16",
    "aria-hidden": true as const,
    focusable: false as const,
  };

  if (status === "ok") {
    return (
      <svg {...common}>
        <path
          d="M3.5 8.2 6.4 11l6.1-6.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "watch") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2.2" fill="currentColor" />
        <path
          d="M1.5 8c1.8-3 4.1-4.5 6.5-4.5S12.7 5 14.5 8c-1.8 3-4.1 4.5-6.5 4.5S3.3 11 1.5 8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    );
  }
  if (status === "act") {
    return (
      <svg {...common}>
        <path
          d="M8 2.2 14.2 13H1.8L8 2.2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8 6.2v3.2M8 11.2h.01"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (status === "cold") {
    return (
      <svg {...common}>
        <path
          d="M8 1.5v13M3.5 3.8l9 8.4M12.5 3.8l-9 8.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 4.8v3.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11" r="0.8" fill="currentColor" />
    </svg>
  );
}

export interface SemanticStatusBadgeProps {
  status: SemanticStatus;
  /** Override the default sentence-case label. */
  label?: string;
  className?: string;
}

export function SemanticStatusBadge({
  status,
  label,
  className,
}: SemanticStatusBadgeProps) {
  const text = label ?? STATUS_LABEL[status];
  const classes = [
    "semantic-status",
    `semantic-status-${status}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      <StatusIcon status={status} />
      <span>{text}</span>
    </span>
  );
}

export interface ShadowModeBadgeProps {
  className?: string;
}

/** Visible while advisory notify remains false. */
export function ShadowModeBadge({ className }: ShadowModeBadgeProps) {
  const classes = ["shadow-mode-badge", className].filter(Boolean).join(" ");
  return (
    <span className={classes} title="Evaluated without notifications">
      <svg
        className="semantic-status-icon"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="8" cy="8" r="2.1" fill="currentColor" />
        <path
          d="M1.5 8c1.8-3 4.1-4.5 6.5-4.5S12.7 5 14.5 8c-1.8 3-4.1 4.5-6.5 4.5S3.3 11 1.5 8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
      Shadow mode
    </span>
  );
}

export interface ProvisionalBadgeProps {
  className?: string;
}

/** Keep for Northern Hemisphere or otherwise uncalibrated thresholds. */
export function ProvisionalBadge({ className }: ProvisionalBadgeProps) {
  const classes = ["provisional-badge", className].filter(Boolean).join(" ");
  return <span className={classes}>Provisional</span>;
}
