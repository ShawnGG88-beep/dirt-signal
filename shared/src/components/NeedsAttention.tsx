import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { GlassPanel } from "./GlassPanel";
import { SemanticStatusBadge } from "./SemanticStatus";
import type { NeedsAttentionItem } from "../lib/dashboardStatus";
import { usePrefersReducedMotion } from "../lib/accessibility";

export interface NeedsAttentionProps {
  items: NeedsAttentionItem[];
  onSelectMetric?: (metricKey: string) => void;
}

/**
 * L2 strip for act-level conditions. Hidden when empty.
 * When an item crosses into act, the row lifts (spring) and the icon pulses once.
 */
export function NeedsAttention({ items, onSelectMetric }: NeedsAttentionProps) {
  const reduceMotion = usePrefersReducedMotion();
  const prevActIds = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const [pulseIds, setPulseIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const actIds = new Set(
      items.filter((i) => i.status === "act").map((i) => i.id),
    );
    if (!seeded.current) {
      seeded.current = true;
      prevActIds.current = actIds;
      return;
    }
    const newlyAct = [...actIds].filter((id) => !prevActIds.current.has(id));
    prevActIds.current = actIds;
    if (newlyAct.length === 0) return;
    setPulseIds(new Set(newlyAct));
    const t = setTimeout(() => setPulseIds(new Set()), 400);
    return () => clearTimeout(t);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <GlassPanel
      layer={2}
      as="section"
      className="needs-attention"
      aria-label="Needs attention"
    >
      <h2 className="needs-attention-title">Needs attention</h2>
      <ul className="needs-attention-list">
        {items.map((item) => {
          const metricKey = item.id.startsWith("metric:")
            ? item.id.slice("metric:".length)
            : null;
          const interactive = metricKey != null && onSelectMetric != null;
          const pulsing = pulseIds.has(item.id);
          const rowClass = [
            "needs-attention-row",
            item.status === "act" ? "is-act" : "",
            pulsing ? "is-act-enter" : "",
            reduceMotion && pulsing ? "is-act-static-rim" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const body = interactive ? (
            <button
              type="button"
              className="needs-attention-button"
              onClick={() => onSelectMetric(metricKey)}
            >
              <span className="needs-attention-item-title">{item.title}</span>
              <SemanticStatusBadge status={item.status} label={item.detail} />
            </button>
          ) : (
            <div className="needs-attention-static" tabIndex={0}>
              <span className="needs-attention-item-title">{item.title}</span>
              <SemanticStatusBadge status={item.status} label={item.detail} />
            </div>
          );

          return (
            <motion.li
              key={item.id}
              className={`needs-attention-item ${rowClass}`}
              initial={
                reduceMotion || !pulsing
                  ? false
                  : { y: 8 }
              }
              animate={{ y: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0.1 }
                  : { type: "spring", stiffness: 300, damping: 30 }
              }
            >
              {body}
            </motion.li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
