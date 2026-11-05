import { describe, expect, it } from "vitest";
import type { AccountRow } from "@/lib/server/pra-wam/accounts";
import { accountState, accountStatus, accountSummary, lastLoginLabel, matchesFilter, matchesSearch, roleCounts, roleGuide, roleItems, summaryLine } from "./account-view";

const row = (patch: Partial<AccountRow> = {}): AccountRow => ({
  employeeId: "e1", name: "Dewi Lestari", department: "Finance", email: "dewi@werkudara.com", active: true,
  hasAccount: true, lastLoginAt: "2026-11-03T02:12:00Z", mustChangePassword: false, roles: [], leads: [], ...patch,
});

describe("account status", () => {
  it("says inactive, reset asked, no account, signed in or not, in that order", () => {
    const none = new Set<string>();
    expect(accountStatus(row({ active: false }), new Set(["e1"])).label).toBe("Nonaktif");
    expect(accountStatus(row(), new Set(["e1"]))).toEqual({ key: "reset", label: "Reset diminta", tone: "warn" });
    expect(accountStatus(row({ hasAccount: false }), none).label).toBe("Belum ada akun");
    expect(accountStatus(row(), none)).toEqual({ key: "aktif", label: "Aktif", tone: "ok" });
    expect(accountStatus(row({ lastLoginAt: null }), none).label).toBe("Belum login");
  });

  it("writes the last sign-in in WIB, or why there is none", () => {
    expect(lastLoginLabel(row())).toBe("3 Nov, 09.12");
    expect(lastLoginLabel(row({ lastLoginAt: null }))).toBe("Belum pernah masuk");
    expect(lastLoginLabel(row({ hasAccount: false }))).toBe("Belum ada akun");
    expect(accountState(row({ mustChangePassword: true }))).toBe("Sudah masuk, masih memakai password awal");
  });
});

describe("roles as pills", () => {
  it("lists BOD, Panitia, Admin WAM, then HOD, and Peserta alone when there is no other role", () => {
    expect(roleItems(row({ roles: ["admin", "panitia"], leads: ["Finance"] })).map(item => typeof item === "string" ? item : item.label)).toEqual(["Panitia", "Admin WAM", "HOD"]);
    expect(roleItems(row({ roles: ["bod"] })).map(item => typeof item === "string" ? item : item.label)).toEqual(["BOD"]);
    expect(roleItems(row()).map(item => typeof item === "string" ? item : item.label)).toEqual(["Peserta"]);
    expect(roleItems(row({ hasAccount: false }))).toEqual([]);
  });
});

describe("filter and search", () => {
  it("filters by role, HOD and never signed in", () => {
    expect(matchesFilter(row({ roles: ["panitia"] }), "panitia")).toBe(true);
    expect(matchesFilter(row(), "panitia")).toBe(false);
    expect(matchesFilter(row({ leads: ["Finance"] }), "hod")).toBe(true);
    expect(matchesFilter(row({ roles: ["admin"] }), "admin")).toBe(true);
    expect(matchesFilter(row({ lastLoginAt: null }), "belum-login")).toBe(true);
    // No account is not "belum login": there is nothing to sign in with yet.
    expect(matchesFilter(row({ hasAccount: false, lastLoginAt: null }), "belum-login")).toBe(false);
    expect(matchesFilter(row(), "semua")).toBe(true);
  });

  it("finds every word in the name, unit or email, ignoring case", () => {
    expect(matchesSearch(row(), "dewi")).toBe(true);
    expect(matchesSearch(row(), "FINANCE")).toBe(true);
    expect(matchesSearch(row(), "werkudara.com dewi")).toBe(true);
    expect(matchesSearch(row(), "dewi legal")).toBe(false);
    expect(matchesSearch(row(), "  ")).toBe(true);
  });
});

describe("counts", () => {
  const rows = [
    row({ employeeId: "a" }),
    row({ employeeId: "b", lastLoginAt: null, roles: ["panitia"] }),
    row({ employeeId: "c", hasAccount: false, lastLoginAt: null }),
    row({ employeeId: "d", hasAccount: false, lastLoginAt: null, email: "" }),
    row({ employeeId: "e", active: false, roles: ["bod"] }),
  ];

  it("count active people only, for the header and Buat akun", () => {
    const summary = accountSummary(rows);
    expect(summary).toEqual({ active: 4, withAccount: 2, signedIn: 1, neverSignedIn: 1, missing: 2, missingEmail: 1, creatable: 1 });
    expect(summaryLine(summary)).toBe("2 orang punya akun. 1 sudah masuk, 1 belum pernah.");
  });

  it("count each role over active people, and have a guide card for each", () => {
    expect(roleCounts(rows)).toEqual({ peserta: 2, panitia: 1, admin: 0, hod: 0, bod: 0 });
    expect(roleGuide.map(item => item.key)).toEqual(["peserta", "panitia", "admin", "hod", "bod"]);
    expect(roleGuide.find(item => item.key === "bod")!.combines).toBeNull();
  });
});
