import { describe, expect, it } from "vitest";
import { contrastRatio, themeStyle, themes } from "./themes";
import { themeKeys } from "./validation";

describe("guest themes", () => {
  it("defines exactly the themes the schema accepts", () => {
    expect(themes.map(theme => theme.key).sort()).toEqual([...themeKeys].sort());
  });

  // WCAG AA: 4.5:1 for body text, 3:1 for large headings and the button label weight we use.
  for (const { key, tokens: t } of themes) {
    it(`${key} keeps text readable (WCAG AA)`, () => {
      expect(contrastRatio(t.text, t.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.text, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.text, t.soft)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.caption, t.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.heading, t.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.primary, t.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.primary, t.soft)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.onPrimary, t.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.onHero, t.hero)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.danger, t.surface)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("leaves the default theme to the stylesheet and only rounds corners when asked", () => {
    expect(themeStyle({ key: "werkudara", corners: "square" })).toEqual({});
    expect(themeStyle({ key: "werkudara", corners: "soft" })).toEqual({ "--radius": "12px" });
    expect(themeStyle({ key: "gala", corners: "square" })).toMatchObject({ "--color-primary": "#c9a35b", "--font-heading": "'Playfair Display', serif" });
  });

  it("computes known contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});
