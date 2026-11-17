import { describe, expect, it } from "vitest";
import { isTester, liveForEveryone, mainWamCan, mainWamGate, mainWamRole, moduleAllows, opensMainWamHome, MAIN_WAM_ACTIONS } from "./access";
import { DEFAULT_MODULES } from "./settings";
import type { MainWamMode } from "./types";

const tester = { tester: true };
const other = { tester: false };

describe("who sees Main WAM, by mode", () => {
  it("in mode pra (the default): penguji by its address, everyone else not found, nobody sent from /wam", () => {
    expect(mainWamGate("pra", tester)).toEqual({ kind: "masuk" });
    expect(mainWamGate("pra", other)).toEqual({ kind: "tutup" });
    expect(opensMainWamHome("pra", tester)).toBe(false);
    expect(opensMainWamHome("pra", other)).toBe(false);
    expect(opensMainWamHome("pra", null)).toBe(false);
  });

  it("in mode uji: only penguji, and /wam sends only them", () => {
    expect(mainWamGate("uji", tester)).toEqual({ kind: "masuk" });
    expect(mainWamGate("uji", other)).toEqual({ kind: "tutup" });
    expect(opensMainWamHome("uji", tester)).toBe(true);
    expect(opensMainWamHome("uji", other)).toBe(false);
    expect(opensMainWamHome("uji", null)).toBe(false);
  });

  it("in mode semua: everyone, and /wam sends everyone (signed in or not)", () => {
    expect(mainWamGate("semua", tester)).toEqual({ kind: "masuk" });
    expect(mainWamGate("semua", other)).toEqual({ kind: "masuk" });
    expect(opensMainWamHome("semua", other)).toBe(true);
    expect(opensMainWamHome("semua", null)).toBe(true);
  });

  it("sends a stranger to sign in: Main WAM's own page only when it is on for everyone", () => {
    expect(mainWamGate("semua", null)).toEqual({ kind: "login", page: "main" });
    for (const mode of ["pra", "uji"] as MainWamMode[]) expect(mainWamGate(mode, null)).toEqual({ kind: "login", page: "pra" });
  });

  it("is live for everyone only in mode semua (notifications to all, the TV)", () => {
    expect(liveForEveryone("semua")).toBe(true);
    expect(liveForEveryone("uji")).toBe(false);
    expect(liveForEveryone("pra")).toBe(false);
  });
});

describe("penguji", () => {
  it("are panitia and Admin WAM always, anyone else only on the list", () => {
    expect(isTester({ roles: ["panitia"] }, false)).toBe(true);
    expect(isTester({ roles: ["admin"] }, false)).toBe(true);
    expect(isTester({ roles: [] }, true)).toBe(true);
    expect(isTester({ roles: [] }, false)).toBe(false);
    expect(isTester({ roles: ["bod"] }, false)).toBe(false);
    expect(isTester({ roles: ["ga"] }, false)).toBe(false);
  });
});

describe("what each role may do", () => {
  const peserta = { roles: [] as const };
  const panitia = { roles: ["panitia"] as const };
  const bod = { roles: ["bod"] as const };
  const admin = { roles: ["admin"] as const };

  it("draws one role, BOD first", () => {
    expect(mainWamRole(peserta)).toBe("peserta");
    expect(mainWamRole(panitia)).toBe("panitia");
    expect(mainWamRole(bod)).toBe("bod");
    expect(mainWamRole(admin)).toBe("admin");
    expect(mainWamRole({ roles: ["panitia", "admin"] })).toBe("panitia");
  });

  it("lets everyone but BOD check in, send to Silent Meeting and vote; BOD approves and reads the recap", () => {
    for (const action of ["absen", "silent-kirim", "voting"] as const) {
      expect(mainWamCan(peserta, action)).toBe(true);
      expect(mainWamCan(panitia, action)).toBe(true);
      expect(mainWamCan(bod, action)).toBe(false);
    }
    for (const action of ["ringkasan", "awarding-setujui", "silent-rekap"] as const) {
      expect(mainWamCan(bod, action)).toBe(true);
      expect(mainWamCan(peserta, action)).toBe(false);
      expect(mainWamCan(panitia, action)).toBe(false);
    }
  });

  it("gives the panitia tools to panitia and admin only, and Momen to everyone", () => {
    for (const action of ["kelola", "silent-kontrol"] as const) {
      expect(mainWamCan(panitia, action)).toBe(true);
      expect(mainWamCan(admin, action)).toBe(true);
      expect(mainWamCan(peserta, action)).toBe(false);
      expect(mainWamCan(bod, action)).toBe(false);
    }
    for (const who of [peserta, panitia, bod, admin]) expect(mainWamCan(who, "foto")).toBe(true);
  });

  it("refuses a module's action while the module is off, whatever the role", () => {
    expect(moduleAllows(peserta, "absen", DEFAULT_MODULES)).toBe(false);
    expect(moduleAllows(peserta, "absen", { ...DEFAULT_MODULES, absen: true })).toBe(true);
    expect(moduleAllows(bod, "awarding-setujui", { ...DEFAULT_MODULES, silent: true })).toBe(false);
    expect(moduleAllows(bod, "awarding-setujui", { ...DEFAULT_MODULES, voting: true })).toBe(true);
    // Core actions need no module.
    expect(moduleAllows(panitia, "kelola", DEFAULT_MODULES)).toBe(true);
    expect(moduleAllows(bod, "ringkasan", DEFAULT_MODULES)).toBe(true);
  });

  it("answers for every action it lists", () => {
    for (const action of MAIN_WAM_ACTIONS) expect(typeof mainWamCan(peserta, action)).toBe("boolean");
  });
});
