import { describe, expect, it } from "vitest";
import { safePraWamNext } from "./next-path";

describe("the way back after signing in (17 Nov 2026)", () => {
  it("allows WAM, Booking Kantor and Wellbeing pages", () => {
    expect(safePraWamNext("/wam/book")).toBe("/wam/book");
    expect(safePraWamNext("/booking/saya")).toBe("/booking/saya");
    expect(safePraWamNext("/wellbeing")).toBe("/wellbeing");
    expect(safePraWamNext("/wellbeing/peringkat")).toBe("/wellbeing/peringkat");
    expect(safePraWamNext("/wellbeing?tab=1")).toBe("/wellbeing?tab=1");
  });
  it("refuses sign-in pages, look-alikes and other sites", () => {
    expect(safePraWamNext("/wellbeing/masuk")).toBeNull();
    expect(safePraWamNext("/wellbeing/masuk?next=/wellbeing")).toBeNull();
    expect(safePraWamNext("/wam/login")).toBeNull();
    expect(safePraWamNext("/wellbeingx")).toBeNull();
    expect(safePraWamNext("//evil.example/wellbeing")).toBeNull();
    expect(safePraWamNext("/wellbeing\\..\\admin")).toBeNull();
    expect(safePraWamNext("/admin/wellbeing")).toBeNull();
    expect(safePraWamNext(null)).toBeNull();
  });
});
