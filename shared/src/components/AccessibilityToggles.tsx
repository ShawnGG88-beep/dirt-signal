import {
  toggleReduceMotion,
  toggleReduceTransparency,
  useReduceMotionPreference,
  useReduceTransparency,
} from "../lib/accessibility";

/** Toggles reduce-transparency preference for glass panels. */
export function ReduceTransparencyToggle() {
  const enabled = useReduceTransparency();
  const label = enabled
    ? "Reduce transparency on. Click for frosted glass."
    : "Reduce transparency off. Click for opaque panels.";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => toggleReduceTransparency()}
      aria-pressed={enabled}
      aria-label={label}
      title={enabled ? "Transparency reduced" : "Frosted glass"}
    >
      <span aria-hidden="true">{enabled ? "▣" : "◇"}</span>
    </button>
  );
}

/** Optional user override for motion, in addition to prefers-reduced-motion. */
export function ReduceMotionToggle() {
  const enabled = useReduceMotionPreference();
  const label = enabled
    ? "Reduce motion on. Click to allow motion."
    : "Reduce motion off. Click to reduce motion.";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => toggleReduceMotion()}
      aria-pressed={enabled}
      aria-label={label}
      title={enabled ? "Motion reduced" : "Motion allowed"}
    >
      <span aria-hidden="true">{enabled ? "⏸" : "►"}</span>
    </button>
  );
}
