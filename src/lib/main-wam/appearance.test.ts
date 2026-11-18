import { describe, expect, it } from "vitest";
import { MAIN_WAM_MODE_COOKIE, mainWamModeCookie, parseMainWamMode } from "./appearance";

describe("Main WAM's look (Terang, Gelap, Sistem)", () => {
  it("is Sistem until a device picks, and for anything unknown", () => {
    for (const value of [undefined, null, "", "auto", "DARK", "terang"]) expect(parseMainWamMode(value)).toBe("system");
    for (const value of ["light", "dark", "system"] as const) expect(parseMainWamMode(value)).toBe(value);
  });

  it("is kept for a year, for WAM's pages only, over https with Secure", () => {
    const cookie = mainWamModeCookie("dark", true);
    expect(cookie).toContain(`${MAIN_WAM_MODE_COOKIE}=dark`);
    expect(cookie).toContain("Path=/wam");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(mainWamModeCookie("light", false)).not.toContain("Secure");
  });
});
