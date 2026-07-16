import {
  RANGE_PRESETS,
  type RangePreset,
} from "../lib/metrics";

interface RangePickerProps {
  value: RangePreset;
  onChange: (preset: RangePreset) => void;
  label?: string;
}

export function RangePicker({
  value,
  onChange,
  label = "Range",
}: RangePickerProps) {
  return (
    <div className="range-picker" role="group" aria-label={label}>
      <span className="range-picker-label">{label}</span>
      <div className="range-picker-options">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={
              value === preset.id
                ? "range-picker-btn range-picker-btn-active"
                : "range-picker-btn"
            }
            onClick={() => onChange(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
