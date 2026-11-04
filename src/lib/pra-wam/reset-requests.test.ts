import { describe, expect, it } from "vitest";
import { escapeLike, matchEmployee, normalizeEmail, resetRequestAnswer, resetRequestSchema, shouldRecord, UNKNOWN_OPEN_CAP } from "./reset-requests";

const now = Date.parse("2026-11-04T10:00:00Z");
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();

describe("Lupa password request", () => {
  it("normalises the email and keeps the note short", () => {
    expect(normalizeEmail("  Nama@Werkudara.COM ")).toBe("nama@werkudara.com");
    const parsed = resetRequestSchema.parse({ email: "  Nama@Werkudara.COM ", note: "  lupa  " });
    expect(parsed).toEqual({ email: "nama@werkudara.com", note: "lupa" });
    expect(resetRequestSchema.parse({ email: "a@b.co" }).note).toBe("");
    expect(resetRequestSchema.safeParse({ email: "bukan email" }).success).toBe(false);
    expect(resetRequestSchema.safeParse({ email: "a@b.co", note: "x".repeat(301) }).success).toBe(false);
    expect(resetRequestSchema.safeParse({ email: "a@b.co", note: "x".repeat(300) }).success).toBe(true);
  });

  it("answers the same whether or not anything was recorded", () => {
    expect(resetRequestAnswer({ migrated: true })).toEqual(resetRequestAnswer({ migrated: true }));
    expect(resetRequestAnswer({ migrated: true }).sent).toBe(true);
    expect(resetRequestAnswer({ migrated: false }).sent).toBe(false);
    expect(resetRequestAnswer({ migrated: false }).message).toMatch(/admin WAM langsung/);
  });

  it("keeps one open request per account", () => {
    const open = [{ employeeId: "a", email: "a@w.com", createdAt: hoursAgo(72) }];
    expect(shouldRecord({ employeeId: "a", email: "a@w.com" }, open, now)).toBe(false);
    expect(shouldRecord({ employeeId: "b", email: "b@w.com" }, open, now)).toBe(true);
  });

  it("ignores an unknown email already open from the last day, and caps unknown emails", () => {
    const open = [{ employeeId: null, email: "X@luar.com", createdAt: hoursAgo(2) }];
    expect(shouldRecord({ employeeId: null, email: "x@luar.com" }, open, now)).toBe(false);
    expect(shouldRecord({ employeeId: null, email: "x@luar.com" }, [{ ...open[0], createdAt: hoursAgo(25) }], now)).toBe(true);
    expect(shouldRecord({ employeeId: null, email: "y@luar.com" }, open, now)).toBe(true);
    const flood = Array.from({ length: UNKNOWN_OPEN_CAP }, (_, n) => ({ employeeId: null, email: `s${n}@spam.com`, createdAt: hoursAgo(1) }));
    expect(shouldRecord({ employeeId: null, email: "baru@luar.com" }, flood, now)).toBe(false);
    // A known account is never held back by unknown emails.
    expect(shouldRecord({ employeeId: "a", email: "a@w.com" }, flood, now)).toBe(true);
  });

  it("matches an employee ignoring case and spaces, an active one first", () => {
    const people = [{ id: "1", email: " Nama@W.com", active: false }, { id: "2", email: "nama@w.com", active: true }, { id: "3", email: "namanya@w.com" }];
    expect(matchEmployee(people, "NAMA@w.com")?.id).toBe("2");
    expect(matchEmployee(people, "lain@w.com")).toBeNull();
    expect(escapeLike("a_b%c\\d")).toBe("a\\_b\\%c\\\\d");
  });
});
