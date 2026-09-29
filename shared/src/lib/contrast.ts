/**
 * WCAG contrast helpers for Phase 5 acceptance checks.
 * Relative luminance per WCAG 2.x.
 */

function srgbChannel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  if (full.length !== 6) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  const r = srgbChannel(parseInt(full.slice(0, 2), 16));
  const g = srgbChannel(parseInt(full.slice(2, 4), 16));
  const b = srgbChannel(parseInt(full.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWcagAa(
  fgHex: string,
  bgHex: string,
  opts: { largeText?: boolean } = {},
): boolean {
  const ratio = contrastRatio(fgHex, bgHex);
  return opts.largeText ? ratio >= 3 : ratio >= 4.5;
}

/** Cellar token pairs used on glass and reduce-transparency fallbacks. */
export const CONTRAST_PAIRS = [
  {
    id: "dark-primary-on-opaque",
    fg: "#fff4ea",
    bg: "#3a2426",
    largeText: false,
  },
  {
    id: "dark-secondary-on-opaque",
    fg: "#b3a5ba",
    bg: "#3a2426",
    largeText: false,
  },
  {
    id: "dark-primary-on-canvas",
    fg: "#fff4ea",
    bg: "#1f1113",
    largeText: false,
  },
  {
    id: "light-primary-on-opaque",
    fg: "#1f1113",
    bg: "#f7e6d6",
    largeText: false,
  },
  {
    id: "light-secondary-on-opaque",
    fg: "#5c4f66",
    bg: "#f7e6d6",
    largeText: false,
  },
  {
    id: "focus-ring-on-cellar",
    fg: "#ffd3ac",
    bg: "#1f1113",
    largeText: true,
  },
] as const;
