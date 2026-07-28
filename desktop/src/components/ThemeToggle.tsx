import {
  cycleThemePreference,
  themePreferenceLabel,
  useThemePreference,
} from "../lib/theme";

/**
 * Cycles dark → light → system. Colours update via CSS custom properties;
 * this control only persists preference and announces the mode.
 */
export function ThemeToggle() {
  const preference = useThemePreference();
  const label = themePreferenceLabel(preference);
  const glyph =
    preference === "dark" ? "☾" : preference === "light" ? "☀" : "◐";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => cycleThemePreference()}
      aria-label={`${label}. Click to cycle theme.`}
      title={label}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
