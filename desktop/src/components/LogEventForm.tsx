import { useEffect, useMemo, useState } from "react";
import { createEvent, type PlantEvent } from "../lib/api";
import {
  eventQuantityApplicable,
  MANUAL_EVENT_TYPES,
  type PlantEventTypeKey,
} from "../lib/eventTypes";

interface LogEventFormProps {
  deviceName?: string;
  onClose: () => void;
  onSaved: (event: PlantEvent) => void;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function fromDatetimeLocalValue(value: string): Date {
  // datetime-local is wall clock in the browser's timezone.
  return new Date(value);
}

export function LogEventForm({
  deviceName = "pi-garden-01",
  onClose,
  onSaved,
}: LogEventFormProps) {
  const [eventType, setEventType] = useState<PlantEventTypeKey>("irrigation");
  const [occurredLocal, setOccurredLocal] = useState(() =>
    toDatetimeLocalValue(new Date()),
  );
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("ml");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeDef = useMemo(
    () => MANUAL_EVENT_TYPES.find((t) => t.key === eventType) ?? null,
    [eventType],
  );
  const showQuantity = eventQuantityApplicable(eventType);

  useEffect(() => {
    if (typeDef?.defaultQuantityUnit) {
      setQuantityUnit(typeDef.defaultQuantityUnit);
    }
  }, [typeDef]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(andAnother: boolean) {
    setSaving(true);
    setError(null);
    try {
      const occurred = fromDatetimeLocalValue(occurredLocal);
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
      const event = await createEvent({
        device_name: deviceName,
        occurred_at: occurred.toISOString(),
        event_type: eventType,
        quantity: showQuantity ? qty : null,
        quantity_unit: showQuantity && qty !== null ? quantityUnit : null,
        note: note.trim() || null,
        source: "manual",
      });
      onSaved(event);
      if (andAnother) {
        setQuantity("");
        setNote("");
        setOccurredLocal(toDatetimeLocalValue(new Date()));
        setSaving(false);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log event");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel log-event-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-event-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="log-event-title">Log event</h2>
            <p className="subtitle">Fast annotation · no confirmation</p>
          </div>
          <button type="button" className="refresh-btn" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="event-type-grid" role="listbox" aria-label="Event type">
          {MANUAL_EVENT_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="option"
              aria-selected={eventType === t.key}
              className={
                eventType === t.key
                  ? "event-type-tile event-type-tile-active"
                  : "event-type-tile"
              }
              style={{ ["--event-colour" as string]: t.colour }}
              onClick={() => setEventType(t.key)}
              title={t.label}
            >
              <span className="event-type-glyph" aria-hidden="true">
                {t.glyph}
              </span>
              <span className="event-type-label">{t.label}</span>
            </button>
          ))}
        </div>

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
              <span>Quantity (optional)</span>
              <input
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="omit if unknown"
              />
            </label>
            <label className="form-field form-field-unit">
              <span>Unit</span>
              <select
                value={quantityUnit}
                onChange={(e) => setQuantityUnit(e.target.value)}
              >
                {eventType === "irrigation" || eventType === "fertiliser" ? (
                  <>
                    <option value="ml">ml</option>
                    <option value="L">L</option>
                  </>
                ) : (
                  <>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="count">count</option>
                  </>
                )}
              </select>
            </label>
          </div>
        )}

        <label className="form-field">
          <span>Note (optional)</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Product, rate, symptom…"
          />
        </label>

        {error && <div className="error-banner">{error}</div>}

        <div className="log-event-actions">
          <button
            type="button"
            className="refresh-btn"
            disabled={saving}
            onClick={() => void submit(false)}
          >
            {saving ? "Saving…" : "Submit"}
          </button>
          <button
            type="button"
            className="export-btn"
            disabled={saving}
            onClick={() => void submit(true)}
          >
            Submit and log another
          </button>
        </div>
      </div>
    </div>
  );
}
