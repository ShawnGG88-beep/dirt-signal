import { describe, expect, it } from "vitest";
import {
  CONTRAST_PAIRS,
  contrastRatio,
  meetsWcagAa,
} from "./contrast";

describe("contrast WCAG AA pairs", () => {
  for (const pair of CONTRAST_PAIRS) {
    it(`${pair.id} meets AA`, () => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(meetsWcagAa(pair.fg, pair.bg, { largeText: pair.largeText })).toBe(
        true,
      );
      expect(ratio).toBeGreaterThanOrEqual(pair.largeText ? 3 : 4.5);
    });
  }
});
