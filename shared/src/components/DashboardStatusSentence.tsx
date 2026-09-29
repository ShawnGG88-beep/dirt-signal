import { useId, useState, type ReactNode } from "react";
import { ProvisionalBadge } from "./SemanticStatus";

export interface DashboardStatusSentenceProps {
  sentence: string;
  /** Collapsed GDD / stage detail retained from the old header. */
  detail?: ReactNode;
  gddProvisional?: boolean;
}

/**
 * Grower-facing one-liner at the top of the dashboard.
 * GDD and stage stay available in an expandable detail block.
 */
export function DashboardStatusSentence({
  sentence,
  detail,
  gddProvisional = false,
}: DashboardStatusSentenceProps) {
  const detailId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="dashboard-status-sentence">
      <p className="dashboard-status-line">{sentence}</p>
      {detail ? (
        <div className="dashboard-status-detail">
          <button
            type="button"
            className="dashboard-status-detail-toggle link-btn"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide season detail" : "Season detail"}
          </button>
          {gddProvisional ? <ProvisionalBadge /> : null}
          {open ? (
            <div id={detailId} className="dashboard-status-detail-body muted">
              {detail}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
