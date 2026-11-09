import { describe, expect, it } from "vitest";
import { parseWamLook, parseWamTheme, resolveWamTheme, WAM_THEME_COLORS, wamBodyStyle, wamThemeCookie } from "./theme";

describe("parseWamTheme", () => {
  it("keeps a known choice", () => {
    expect(parseWamTheme("light")).toBe("light");
    expect(parseWamTheme("dark")).toBe("dark");
    expect(parseWamTheme("system")).toBe("system");
  });
  it("falls back to dark for anything else: WAM starts at night", () => {
    expect(parseWamTheme(undefined)).toBe("dark");
    expect(parseWamTheme(null)).toBe("dark");
    expect(parseWamTheme("")).toBe("dark");
    expect(parseWamTheme("LIGHT")).toBe("dark");
    expect(parseWamTheme("auto")).toBe("dark");
  });
});

it("resolves system from the device", () => {
  expect(resolveWamTheme("system", true)).toBe("dark");
  expect(resolveWamTheme("system", false)).toBe("light");
  expect(resolveWamTheme("light", true)).toBe("light");
});

it("stores the cookie for WAM's pages for a year", () => {
  expect(wamThemeCookie("dark", true)).toBe("wam_theme=dark; Path=/wam; Max-Age=31536000; SameSite=Lax; Secure");
  expect(wamThemeCookie("light", false)).not.toContain("Secure");
});

describe("the app's theme", () => {
  it("keeps a known theme and falls back to Dream Out Loud", () => {
    expect(parseWamLook("werkudara")).toBe("werkudara");
    expect(parseWamLook("dream")).toBe("dream");
    expect(parseWamLook(undefined)).toBe("dream");
    expect(parseWamLook("biru")).toBe("dream");
  });
  it("paints the page behind WAM in the theme's colours", () => {
    expect(wamBodyStyle("dream")).toContain(`background:${WAM_THEME_COLORS.dream.dark.page}`);
    expect(wamBodyStyle("werkudara")).toContain(`background:${WAM_THEME_COLORS.werkudara.light.page}`);
    expect(wamBodyStyle("werkudara")).not.toContain(WAM_THEME_COLORS.dream.dark.page);
  });
});
