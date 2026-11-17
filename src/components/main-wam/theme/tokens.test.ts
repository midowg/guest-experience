import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, contrast, normalizeHex, readableOn, resolveTheme, safeImageUrl, themeVars } from "./tokens";

describe("theme tokens", () => {
  it("the neutral theme passes its own checks and writes nothing", () => {
    const theme = resolveTheme(null);
    expect(theme.colors).toEqual(DEFAULT_THEME);
    expect(theme.warnings).toEqual([]);
    expect(themeVars(theme)).toEqual({});
  });

  it("matches the contrast table of DESIGN_SYSTEM §1.7", () => {
    expect(contrast("#FFFFFF", "#2F6FEB")).toBeCloseTo(4.57, 1);
    expect(contrast("#1D4ED8", "#FFFFFF")).toBeCloseTo(6.70, 1);
    expect(contrast("#FFFFFF", "#1E3A5F")).toBeCloseTo(11.5, 0);
    expect(contrast("#C9D6E8", "#1E3A5F")).toBeCloseTo(7.81, 1);
  });

  it("takes a readable accent and derives its text", () => {
    const theme = resolveTheme({ accent: "#b45309" });
    expect(theme.warnings).toEqual([]);
    expect(theme.colors.accent).toBe("#B45309");
    expect(theme.colors.onAccent).toBe(readableOn("#B45309"));
    expect(themeVars(theme)["--mw-kv-accent"]).toBe("#B45309");
  });

  it("keeps the whole default group when a value is not a colour or not readable", () => {
    const bad = resolveTheme({ accent: "red; background: url(x)" });
    expect(bad.colors.accent).toBe(DEFAULT_THEME.accent);
    expect(bad.warnings.join(" ")).toContain("aksen acara");
    const pale = resolveTheme({ accent: "#EEEEEE", onAccent: "#FFFFFF" });
    expect(pale.colors.accent).toBe(DEFAULT_THEME.accent);
    expect(pale.colors.onAccent).toBe(DEFAULT_THEME.onAccent);
    // Dark text would read on yellow, but yellow icons and focus rings vanish on white (< 3:1): default.
    const primary = resolveTheme({ primary: "#FFD400" });
    expect(primary.colors.primary).toBe(DEFAULT_THEME.primary);
    expect(primary.warnings.join(" ")).toContain("primary di surface");
  });

  it("accepts only known display faces", () => {
    expect(resolveTheme({ displayFont: "plus-jakarta-sans" }).displayFont).toBe("plus-jakarta-sans");
    const other = resolveTheme({ displayFont: "Comic Sans" });
    expect(other.displayFont).toBe("plus-jakarta-sans");
    expect(other.warnings.length).toBe(1);
  });

  it("lets only https or site paths into url()", () => {
    expect(safeImageUrl("/api/wam/acara/tema/splash?v=3")).toBe("/api/wam/acara/tema/splash?v=3");
    expect(safeImageUrl("https://cdn.example/kv.webp")).toBe("https://cdn.example/kv.webp");
    expect(safeImageUrl("http://cdn.example/kv.webp")).toBeNull();
    expect(safeImageUrl("//evil.example/x.png")).toBeNull();
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl('/x.png") , url("/y.png')).toBeNull();
    const theme = resolveTheme({ images: { splash: "/api/wam/acara/tema/splash?v=3", homeHeader: "data:image/png;base64,AAAA" } });
    expect(themeVars(theme)["--mw-image-splash"]).toBe('url("/api/wam/acara/tema/splash?v=3")');
    expect(themeVars(theme)["--mw-image-home-header"]).toBeUndefined();
  });

  it("normalises hex", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex(" #1e3a5f ")).toBe("#1E3A5F");
    expect(normalizeHex("1e3a5f")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });

  it("every slot the theme writes is read by theme.module.css", () => {
    const sheet = readFileSync(new URL("./theme.module.css", import.meta.url), "utf8");
    const theme = resolveTheme({
      primary: "#1F4FBF", primaryStrong: "#163C94", onPrimary: "#FFFFFF", primaryContainer: "#E2E9F8", onPrimaryContainer: "#163C94",
      accent: "#7A1F2B", onAccent: "#FFFFFF", onAccent2: "#F3D9DC", accentContainer: "#F7E7E9", onAccentContainer: "#7A1F2B",
      images: { splash: "/a.png", homeHeader: "/b.png", pattern: "/c.png", mosaic: "/d.png" },
    });
    expect(theme.warnings).toEqual([]);
    for (const name of Object.keys(themeVars(theme))) expect(sheet).toContain(name);
  });
});
