import { useEffect, useMemo, useRef, useState } from "react";
import type { PlantEvent } from "../lib/api";
import {
  eventTypeColour,
  eventTypeGlyph,
  eventTypeLabel,
  PLANT_EVENT_TYPES,
  type PlantEventTypeKey,
} from "../lib/eventTypes";
import { EventDetailPopover } from "./EventDetailPopover";

const CLUSTER_PX = 12;

interface EventMarkerRailProps {
  events: PlantEvent[];
  fromAt: Date;
  toAt: Date;
  enabledTypes: Set<PlantEventTypeKey>;
  onEventsChanged: () => void;
  compact?: boolean;
}

interface MarkerCluster {
  id: string;
  xPct: number;
  events: PlantEvent[];
}

function timeToPct(iso: string, fromMs: number, spanMs: number): number {
  if (spanMs <= 0) return 50;
  const t = new Date(iso).getTime();
  const pct = ((t - fromMs) / spanMs) * 100;
  return Math.min(100, Math.max(0, pct));
}

function clusterEvents(
  events: PlantEvent[],
  fromMs: number,
  spanMs: number,
  railWidthPx: number,
): MarkerCluster[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
  const clusters: MarkerCluster[] = [];
  let bucket: PlantEvent[] = [];
  let bucketCentrePx = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    const avgPct =
      bucket.reduce(
        (sum, e) => sum + timeToPct(e.occurred_at, fromMs, spanMs),
        0,
      ) / bucket.length;
    clusters.push({
      id: bucket.map((e) => e.id).join("|"),
      xPct: avgPct,
      events: bucket,
    });
    bucket = [];
  };

  for (const event of sorted) {
    const xPct = timeToPct(event.occurred_at, fromMs, spanMs);
    const xPx = (xPct / 100) * railWidthPx;
    if (bucket.length === 0) {
      bucket = [event];
      bucketCentrePx = xPx;
      continue;
    }
    if (Math.abs(xPx - bucketCentrePx) <= CLUSTER_PX) {
      bucket.push(event);
      bucketCentrePx =
        bucket.reduce((sum, e) => {
          return (
            sum + (timeToPct(e.occurred_at, fromMs, spanMs) / 100) * railWidthPx
          );
        }, 0) / bucket.length;
    } else {
      flush();
      bucket = [event];
      bucketCentrePx = xPx;
    }
  }
  flush();
  return clusters;
}

export function EventMarkerRail({
  events,
  fromAt,
  toAt,
  enabledTypes,
  onEventsChanged,
  compact = false,
}: EventMarkerRailProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [railWidth, setRailWidth] = useState(400);
  const [active, setActive] = useState<{
    cluster: MarkerCluster;
    anchorPct: number;
  } | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setRailWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fromMs = fromAt.getTime();
  const toMs = toAt.getTime();
  const spanMs = Math.max(1, toMs - fromMs);

  const filtered = useMemo(
    () =>
      events.filter((e) =>
        enabledTypes.has(e.event_type as PlantEventTypeKey),
      ),
    [events, enabledTypes],
  );

  const clusters = useMemo(
    () => clusterEvents(filtered, fromMs, spanMs, railWidth),
    [filtered, fromMs, spanMs, railWidth],
  );

  return (
    <div className={compact ? "event-rail event-rail-compact" : "event-rail"}>
      <div className="event-rail-track" ref={trackRef}>
        {clusters.map((cluster) => {
          const single = cluster.events.length === 1 ? cluster.events[0] : null;
          const colour = single
            ? eventTypeColour(single.event_type)
            : "#c0c0c0";
          const label = single
            ? eventTypeLabel(single.event_type)
            : `${cluster.events.length} events`;
          return (
            <button
              key={cluster.id}
              type="button"
              className={
                single
                  ? "event-rail-marker"
                  : "event-rail-marker event-rail-cluster"
              }
              style={{
                left: `${cluster.xPct}%`,
                color: colour,
                borderColor: colour,
              }}
              title={label}
              aria-label={label}
              onClick={(e) => {
                e.stopPropagation();
                setActive({ cluster, anchorPct: cluster.xPct });
              }}
            >
              {single ? (
                <span aria-hidden="true">
                  {eventTypeGlyph(single.event_type)}
                </span>
              ) : (
                <span aria-hidden="true">{cluster.events.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {active && (
        <EventDetailPopover
          events={active.cluster.events}
          anchorPct={active.anchorPct}
          onClose={() => setActive(null)}
          onChanged={() => {
            setActive(null);
            onEventsChanged();
          }}
        />
      )}
    </div>
  );
}

interface EventTypeFilterProps {
  enabled: Set<PlantEventTypeKey>;
  onChange: (next: Set<PlantEventTypeKey>) => void;
}

export function EventTypeFilter({ enabled, onChange }: EventTypeFilterProps) {
  function toggle(key: PlantEventTypeKey) {
    const next = new Set(enabled);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  return (
    <div
      className="event-type-filter"
      role="group"
      aria-label="Event type filter"
    >
      {PLANT_EVENT_TYPES.map((t) => {
        const on = enabled.has(t.key);
        return (
          <button
            key={t.key}
            type="button"
            className={
              on
                ? "event-filter-chip event-filter-chip-on"
                : "event-filter-chip"
            }
            style={{ ["--event-colour" as string]: t.colour }}
            aria-pressed={on}
            title={t.label}
            onClick={() => toggle(t.key)}
          >
            <span aria-hidden="true">{t.glyph}</span>
            <span className="event-filter-chip-label">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
