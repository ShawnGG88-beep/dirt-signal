import { useEffect, useState } from "react";
import {
  setSelectedDeviceName,
  useSelectedDeviceName,
} from "@dirt-signal/shared";
import { supabase } from "../lib/supabaseClient";

interface DeviceOption {
  id: string;
  name: string;
}

/** Device selector backed by the devices table. */
export function DevicePicker() {
  const selected = useSelectedDeviceName();
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: loadError } = await supabase
        .from("devices")
        .select("id, name")
        .order("name");
      if (cancelled) return;
      if (loadError) {
        setError(loadError.message);
        return;
      }
      setDevices((data ?? []) as DeviceOption[]);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Always include the current selection so the control is never blank,
  // even before the list loads or if the stored name no longer exists.
  const options = devices.some((d) => d.name === selected)
    ? devices
    : [{ id: "selected", name: selected }, ...devices];

  return (
    <label className="device-picker" title={error ?? undefined}>
      <span className="device-picker-label">Device</span>
      <select
        className="device-picker-select"
        value={selected}
        onChange={(e) => setSelectedDeviceName(e.target.value)}
      >
        {options.map((device) => (
          <option key={device.id} value={device.name}>
            {device.name}
          </option>
        ))}
      </select>
    </label>
  );
}
