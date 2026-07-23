import { useEffect, useState } from "react";
import {
  deleteEvent,
  updateEvent,
  type PlantEvent,
} from "../lib/api";
import {
  eventQuantityApplicable,
  eventTypeLabel,
  MANUAL_EVENT_TYPES,
  PLANT_EVENT_TYPES,
  type PlantEventTypeKey,
} from "../lib/eventTypes";

interface EventDetailPopoverProps {
  events: PlantEvent[];
  anchorPct: number;
  onClose: () => void;
  onChanged: () => void;
}

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EventDetailPopover({
  events,
  anchorPct,
  onClose,
  onChanged,
}: EventDetailPopoverProps) {
  const [editing, setEditing] = useState<PlantEvent | null>(
    events.length === 1 ? events[0] : null,
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = Math.min(92, Math.max(8, anchorPct));

  return (
    <div
      className="event-popover"
      style={{ left: `${left}%` }}
      role="dialog"
      aria-label="Event detail"
    >
      <button
        type="button"
        className="event-popover-close"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>

      {!editing && (
        <ul className="event-popover-list">
          {events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                className="event-popover-item"
                onClick={() => setEditing(event)}
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
      )}

      {editing && (
        <EventEditForm
          event={editing}
          onCancel={() => {
            if (events.length === 1) onClose();
            else setEditing(null);
          }}
          onSaved={onChanged}
          onDeleted={onChanged}
        />
      )}
    </div>
  );
}

interface EventEditFormProps {
  event: PlantEvent;
  onCancel: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function EventEditForm({
  event,
  onCancel,
  onSaved,
  onDeleted,
}: EventEditFormProps) {
  const [eventType, setEventType] = useState(event.event_type);
  const [occurredLocal, setOccurredLocal] = useState(
    toDatetimeLocalValue(event.occurred_at),
  );
  const [quantity, setQuantity] = useState(
    event.quantity != null ? String(event.quantity) : "",
  );
  const [quantityUnit, setQuantityUnit] = useState(
    event.quantity_unit ?? "ml",
  );
  const [note, setNote] = useState(event.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showQuantity = eventQuantityApplicable(eventType);
  const typeOptions =
    event.source === "system" ? PLANT_EVENT_TYPES : MANUAL_EVENT_TYPES;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const occurred = new Date(occurredLocal);
      if (Number.isNaN(occurred.getTime())) {
        throw new Error("Invalid date/time");
      }
      let qty: number | null = null;
      if (showQuantity && quantity.trim() !== "") {
        qty = Number(quantity);
        if (!Number.isFinite(qty) || qty < 0) {
          throw new Error("Quantity must be a non-negative number");
        }
      }
      await updateEvent(event.id, {
        occurred_at: occurred.toISOString(),
        event_type: eventType,
        note: note.trim() || null,
        ...(showQuantity
          ? qty === null
            ? { clear_quantity: true }
            : { quantity: qty, quantity_unit: quantityUnit }
          : { clear_quantity: true }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await deleteEvent(event.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setSaving(false);
    }
  }

  return (
    <div className="event-edit-form">
      <label className="form-field">
        <span>Type</span>
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value as PlantEventTypeKey)}
          disabled={event.source === "system"}
        >
          {typeOptions.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>When</span>
        <input
          type="datetime-local"
          value={occurredLocal}
          onChange={(e) => setOccurredLocal(e.target.value)}
        />
      </label>
      {showQuantity && (
        <div className="form-row">
          <label className="form-field">
            <span>Quantity</span>
            <input
              type="number"
              min={0}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="form-field form-field-unit">
            <span>Unit</span>
            <input
              type="text"
              value={quantityUnit}
              onChange={(e) => setQuantityUnit(e.target.value)}
            />
          </label>
        </div>
      )}
      <label className="form-field">
        <span>Note</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error && <div className="error-banner">{error}</div>}
      <div className="log-event-actions">
        <button
          type="button"
          className="refresh-btn"
          disabled={saving}
          onClick={() => void save()}
        >
          Save
        </button>
        <button
          type="button"
          className="event-delete-btn"
          disabled={saving}
          onClick={() => void remove()}
        >
          Delete
        </button>
        <button
          type="button"
          className="export-btn"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
