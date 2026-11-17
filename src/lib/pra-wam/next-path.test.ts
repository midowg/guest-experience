import { describe, expect, it } from "vitest";
import { safePraWamNext } from "./next-path";

describe("the way back after signing in (17 Nov 2026)", () => {
  it("allows WAM, Booking Kantor and Wellbeing pages", () => {
    expect(safePraWamNext("/wam/book")).toBe("/wam/book");
    expect(safePraWamNext("/booking/saya")).toBe("/booking/saya");
    expect(safePraWamNext("/wellbeing")).toBe("/wellbeing");
    expect(safePraWamNext("/wellbeing/peringkat")).toBe("/wellbeing/peringkat");
    expect(safePraWamNext("/wellbeing?tab=1")).toBe("/wellbeing?tab=1");
    // WLM's address since 18 Nov 2026.
    expect(safePraWamNext("/wlm")).toBe("/wlm");
    expect(safePraWamNext("/wlm/profil")).toBe("/wlm/profil");
    // Main WAM (17 Nov 2026), under /wam.
    expect(safePraWamNext("/wam/acara/absen/abc")).toBe("/wam/acara/absen/abc");
  });
  it("refuses sign-in pages, look-alikes and other sites", () => {
    expect(safePraWamNext("/wellbeing/masuk")).toBeNull();
    expect(safePraWamNext("/wellbeing/masuk?next=/wellbeing")).toBeNull();
    expect(safePraWamNext("/wam/login")).toBeNull();
    expect(safePraWamNext("/wam/acara/masuk")).toBeNull();
    expect(safePraWamNext("/wam/acara/masuk?next=/wam/acara")).toBeNull();
    expect(safePraWamNext("/wellbeingx")).toBeNull();
    expect(safePraWamNext("/wlm/masuk")).toBeNull();
    expect(safePraWamNext("/wlmx")).toBeNull();
    expect(safePraWamNext("/admin/wlm")).toBeNull();
    expect(safePraWamNext("//evil.example/wellbeing")).toBeNull();
    expect(safePraWamNext("/wellbeing\\..\\admin")).toBeNull();
    expect(safePraWamNext("/admin/wellbeing")).toBeNull();
    expect(safePraWamNext(null)).toBeNull();
  });
});
