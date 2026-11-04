import { describe, expect, it } from "vitest";
import { parseWamTheme, resolveWamTheme, wamThemeCookie } from "./theme";

describe("parseWamTheme", () => {
  it("keeps a known choice", () => {
    expect(parseWamTheme("light")).toBe("light");
    expect(parseWamTheme("dark")).toBe("dark");
    expect(parseWamTheme("system")).toBe("system");
  });
  it("falls back to light for anything else", () => {
    expect(parseWamTheme(undefined)).toBe("light");
    expect(parseWamTheme(null)).toBe("light");
    expect(parseWamTheme("")).toBe("light");
    expect(parseWamTheme("DARK")).toBe("light");
    expect(parseWamTheme("auto")).toBe("light");
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
