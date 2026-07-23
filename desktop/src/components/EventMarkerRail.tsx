import { useEffect, useMemo, useRef, useState } from "react";
import type { AlertEvent, PlantEvent } from "../lib/api";
import {
  eventTypeColour,
  eventTypeGlyph,
  eventTypeLabel,
  PLANT_EVENT_TYPES,
  type PlantEventTypeKey,
} from "../lib/eventTypes";
import { EventDetailPopover } from "./EventDetailPopover";

const CLUSTER_PX = 12;

export const ALERT_FILTER_KEY = "alert_open" as const;

interface EventMarkerRailProps {
  events: PlantEvent[];
  alerts?: AlertEvent[];
  fromAt: Date;
  toAt: Date;
  enabledTypes: Set<PlantEventTypeKey>;
  showAlerts?: boolean;
  onEventsChanged: () => void;
  compact?: boolean;
}

type RailItem =
  | { kind: "event"; at: string; event: PlantEvent }
  | { kind: "alert"; at: string; alert: AlertEvent };

interface MarkerCluster {
  id: string;
  xPct: number;
  items: RailItem[];
}

function timeToPct(iso: string, fromMs: number, spanMs: number): number {
  if (spanMs <= 0) return 50;
  const t = new Date(iso).getTime();
  const pct = ((t - fromMs) / spanMs) * 100;
  return Math.min(100, Math.max(0, pct));
}

function severityColour(severity: string): string {
  if (severity === "critical") return "#ff4444";
  if (severity === "warning") return "#FF8A00";
  return "#107EEC";
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clusterItems(
  items: RailItem[],
  fromMs: number,
  spanMs: number,
  railWidthPx: number,
): MarkerCluster[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const clusters: MarkerCluster[] = [];
  let bucket: RailItem[] = [];
  let bucketCentrePx = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    const avgPct =
      bucket.reduce((sum, e) => sum + timeToPct(e.at, fromMs, spanMs), 0) /
      bucket.length;
    clusters.push({
      id: bucket
        .map((e) => (e.kind === "event" ? e.event.id : `a:${e.alert.id}`))
        .join("|"),
      xPct: avgPct,
      items: bucket,
    });
    bucket = [];
  };

  for (const item of sorted) {
    const xPct = timeToPct(item.at, fromMs, spanMs);
    const xPx = (xPct / 100) * railWidthPx;
    if (bucket.length === 0) {
      bucket = [item];
      bucketCentrePx = xPx;
      continue;
    }
    if (Math.abs(xPx - bucketCentrePx) <= CLUSTER_PX) {
      bucket.push(item);
      bucketCentrePx =
        bucket.reduce((sum, e) => {
          return sum + (timeToPct(e.at, fromMs, spanMs) / 100) * railWidthPx;
        }, 0) / bucket.length;
    } else {
      flush();
      bucket = [item];
      bucketCentrePx = xPx;
    }
  }
  flush();
  return clusters;
}

export function EventMarkerRail({
  events,
  alerts = [],
  fromAt,
  toAt,
  enabledTypes,
  showAlerts = true,
  onEventsChanged,
  compact = false,
}: EventMarkerRailProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [railWidth, setRailWidth] = useState(400);
  const [active, setActive] = useState<{
    cluster: MarkerCluster;
    anchorPct: number;
  } | null>(null);
  const [editingEvent, setEditingEvent] = useState<PlantEvent | null>(null);

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

  const items = useMemo(() => {
    const out: RailItem[] = events
      .filter((e) => enabledTypes.has(e.event_type as PlantEventTypeKey))
      .map((event) => ({ kind: "event" as const, at: event.occurred_at, event }));
    if (showAlerts) {
      for (const alert of alerts) {
        out.push({ kind: "alert", at: alert.opened_at, alert });
      }
    }
    return out;
  }, [events, alerts, enabledTypes, showAlerts]);

  const clusters = useMemo(
    () => clusterItems(items, fromMs, spanMs, railWidth),
    [items, fromMs, spanMs, railWidth],
  );

  return (
    <div className={compact ? "event-rail event-rail-compact" : "event-rail"}>
      <div className="event-rail-track" ref={trackRef}>
        {clusters.map((cluster) => {
          const single = cluster.items.length === 1 ? cluster.items[0] : null;
          let colour = "#c0c0c0";
          let label = `${cluster.items.length} markers`;
          let glyph = String(cluster.items.length);
          let extraClass = "";
          if (single?.kind === "event") {
            colour = eventTypeColour(single.event.event_type);
            label = eventTypeLabel(single.event.event_type);
            glyph = eventTypeGlyph(single.event.event_type);
          } else if (single?.kind === "alert") {
            colour = severityColour(single.alert.severity);
            label = `Alert · ${single.alert.severity}`;
            glyph = "!";
            extraClass = " event-rail-marker-alert";
          }
          return (
            <button
              key={cluster.id}
              type="button"
              className={
                (single
                  ? "event-rail-marker"
                  : "event-rail-marker event-rail-cluster") + extraClass
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
              <span aria-hidden="true">{glyph}</span>
            </button>
          );
        })}
      </div>

      {active && !editingEvent && (() => {
        const plantEvents = active.cluster.items
          .filter((i): i is Extract<RailItem, { kind: "event" }> => i.kind === "event")
          .map((i) => i.event);
        const alertItems = active.cluster.items.filter(
          (i): i is Extract<RailItem, { kind: "alert" }> => i.kind === "alert",
        );
        if (plantEvents.length > 0 && alertItems.length === 0) {
          return (
            <EventDetailPopover
              events={plantEvents}
              anchorPct={active.anchorPct}
              onClose={() => setActive(null)}
              onChanged={() => {
                setActive(null);
                onEventsChanged();
              }}
            />
          );
        }
        const left = Math.min(92, Math.max(8, active.anchorPct));
        return (
          <div
            className="event-popover"
            style={{ left: `${left}%` }}
            role="dialog"
            aria-label="Marker detail"
          >
            <button
              type="button"
              className="event-popover-close"
              onClick={() => setActive(null)}
              aria-label="Close"
            >
              ×
            </button>
            <ul className="event-popover-list">
              {alertItems.map(({ alert }) => (
                <li key={alert.id} className="event-popover-alert">
                  <span
                    className="event-popover-type"
                    style={{ color: severityColour(alert.severity) }}
                  >
                    Alert · {alert.severity}
                  </span>
                  <span className="event-popover-when">
                    {formatWhen(alert.opened_at)}
                  </span>
                  <span className="event-popover-note">{alert.message}</span>
                </li>
              ))}
              {plantEvents.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className="event-popover-item"
                    onClick={() => setEditingEvent(event)}
                  >
                    <span className="event-popover-type">
                      {eventTypeLabel(event.event_type)}
                    </span>
                    <span className="event-popover-when">
                      {formatWhen(event.occurred_at)}
                    </span>
                    {event.note && (
                      <span className="event-popover-note">{event.note}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {editingEvent && active && (
        <EventDetailPopover
          events={[editingEvent]}
          anchorPct={active.anchorPct}
          onClose={() => setEditingEvent(null)}
          onChanged={() => {
            setEditingEvent(null);
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
  showAlerts?: boolean;
  onShowAlertsChange?: (show: boolean) => void;
}

export function EventTypeFilter({
  enabled,
  onChange,
  showAlerts = true,
  onShowAlertsChange,
}: EventTypeFilterProps) {
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
      {onShowAlertsChange && (
        <button
          type="button"
          className={
            showAlerts
              ? "event-filter-chip event-filter-chip-on"
              : "event-filter-chip"
          }
          style={{ ["--event-colour" as string]: "#ff4444" }}
          aria-pressed={showAlerts}
          title="Alert openings"
          onClick={() => onShowAlertsChange(!showAlerts)}
        >
          <span aria-hidden="true">!</span>
          <span className="event-filter-chip-label">Alerts</span>
        </button>
      )}
    </div>
  );
}
