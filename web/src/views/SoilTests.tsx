import { useCallback, useEffect, useState, type FormEvent } from "react";
import { NPK_LEVELS, useSelectedDeviceName } from "@dirt-signal/shared";
import { supabase } from "../lib/supabaseClient";

interface SoilTestRow {
  id: number;
  device_id: string;
  tested_at: string;
  ph_strip: number | null;
  n_level: string | null;
  p_level: string | null;
  k_level: string | null;
  notes: string | null;
}

function toDatetimeLocalValue(date: Date): string {
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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function resolveDeviceId(deviceName: string): Promise<string> {
  const { data, error } = await supabase
    .from("devices")
    .select("id")
    .eq("name", deviceName)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  if (!row) throw new Error(`No device named '${deviceName}' found`);
  return String(row.id);
}

/**
 * Ground-truth chemical strip results. Mirrors the sidecar's POST
 * /soil-tests contract: nutrient levels are required categories, pH strip
 * and notes optional.
 */
export function SoilTests() {
  const deviceName = useSelectedDeviceName();
  const [tests, setTests] = useState<SoilTestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [testedLocal, setTestedLocal] = useState(() =>
    toDatetimeLocalValue(new Date()),
  );
  const [phStrip, setPhStrip] = useState("");
  const [nLevel, setNLevel] = useState("medium");
  const [pLevel, setPLevel] = useState("medium");
  const [kLevel, setKLevel] = useState("medium");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = await resolveDeviceId(deviceName);
      const { data, error: loadError } = await supabase
        .from("soil_tests")
        .select("*")
        .eq("device_id", deviceId)
        .order("tested_at", { ascending: false })
        .limit(200);
      if (loadError) throw new Error(loadError.message);
      setTests((data ?? []) as SoilTestRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load soil tests");
      setTests([]);
    } finally {
      setLoading(false);
    }
  }, [deviceName]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const tested = new Date(testedLocal);
      if (Number.isNaN(tested.getTime())) {
        throw new Error("Invalid date/time");
      }
      let ph: number | null = null;
      if (phStrip.trim() !== "") {
        ph = Number(phStrip);
        if (!Number.isFinite(ph) || ph < 0 || ph > 14) {
          throw new Error("pH must be between 0 and 14");
        }
      }
      const deviceId = await resolveDeviceId(deviceName);
      const { error: insertError } = await supabase.from("soil_tests").insert({
        device_id: deviceId,
        tested_at: tested.toISOString(),
        ph_strip: ph,
        n_level: nLevel,
        p_level: pLevel,
        k_level: kLevel,
        notes: notes.trim() || null,
      });
      if (insertError) throw new Error(insertError.message);
      setPhStrip("");
      setNotes("");
      setTestedLocal(toDatetimeLocalValue(new Date()));
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to log soil test");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="view-page">
      <header className="view-header">
        <div>
          <h1>Soil tests</h1>
          <p className="subtitle">
            Chemical strip ground truth · {deviceName} · newest first
          </p>
        </div>
      </header>

      <form className="soil-test-form" onSubmit={onSubmit}>
        <div className="form-row">
          <label className="form-field">
            <span>Tested at</span>
            <input
              type="datetime-local"
              value={testedLocal}
              onChange={(e) => setTestedLocal(e.target.value)}
            />
          </label>
          <label className="form-field form-field-unit">
            <span>pH strip (optional)</span>
            <input
              type="number"
              min={0}
              max={14}
              step="0.1"
              value={phStrip}
              placeholder="e.g. 6.5"
              onChange={(e) => setPhStrip(e.target.value)}
            />
          </label>
        </div>
        <div className="form-row">
          {(
            [
              ["N", nLevel, setNLevel],
              ["P", pLevel, setPLevel],
              ["K", kLevel, setKLevel],
            ] as const
          ).map(([label, value, setValue]) => (
            <label key={label} className="form-field">
              <span>{label} level</span>
              <select value={value} onChange={(e) => setValue(e.target.value)}>
                {NPK_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="form-field">
          <span>Notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Strip brand, sampling depth, observations…"
          />
        </label>
        {formError && <div className="error-banner">{formError}</div>}
        <div className="log-event-actions">
          <button type="submit" className="refresh-btn" disabled={saving}>
            {saving ? "Saving…" : "Log soil test"}
          </button>
        </div>
      </form>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="view-status">Loading…</p>}
      {!loading && tests.length === 0 && !error && (
        <p className="view-status">No soil tests recorded for this device.</p>
      )}

      {!loading && tests.length > 0 && (
        <div className="table-scroll">
          <table className="report-table soil-test-table">
            <thead>
              <tr>
                <th>Tested at</th>
                <th>pH strip</th>
                <th>N</th>
                <th>P</th>
                <th>K</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id}>
                  <td>{formatWhen(test.tested_at)}</td>
                  <td>{test.ph_strip ?? "—"}</td>
                  <td>{test.n_level ?? "—"}</td>
                  <td>{test.p_level ?? "—"}</td>
                  <td>{test.k_level ?? "—"}</td>
                  <td className="ref-cell">{test.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
