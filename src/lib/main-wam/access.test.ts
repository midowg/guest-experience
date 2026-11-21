import { describe, expect, it } from "vitest";
import { isTester, liveForEveryone, mainWamCan, mainWamGate, mainWamRole, mainWamRolesOf, moduleAllows, opensMainWamHome, showsCommitteeTab, MAIN_WAM_ACTIONS } from "./access";
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

describe("Main WAM's own roles (20 Nov 2026: Panitia WAM apart from Pra WAM's committee)", () => {
  it("keep BOD from the account, drop Pra WAM's panitia and admin, and add panitia for Panitia WAM", () => {
    expect(mainWamRolesOf(["panitia"], false)).toEqual([]);
    expect(mainWamRolesOf(["admin"], false)).toEqual([]);
    expect(mainWamRolesOf(["admin", "panitia", "ga"], false)).toEqual(["ga"]);
    expect(mainWamRolesOf(["bod"], false)).toEqual(["bod"]);
    expect(mainWamRolesOf([], true)).toEqual(["panitia"]);
    expect(mainWamRolesOf(["panitia"], true)).toEqual(["panitia"]);
  });
  it("so Pra WAM's panitia or admin is a peserta in Main WAM, without the Panitia tab or its tools, unless on Panitia WAM", () => {
    const praCommittee = { roles: mainWamRolesOf(["panitia", "admin"], false) };
    expect(mainWamRole(praCommittee)).toBe("peserta");
    expect(showsCommitteeTab(praCommittee)).toBe(false);
    expect(mainWamCan(praCommittee, "kelola")).toBe(false);
    expect(isTester(praCommittee, false)).toBe(false);
    const wamCommittee = { roles: mainWamRolesOf([], true) };
    expect(showsCommitteeTab(wamCommittee)).toBe(true);
    expect(mainWamCan(wamCommittee, "kelola")).toBe(true);
    expect(isTester(wamCommittee, false)).toBe(true);
  });
});

describe("penguji", () => {
  it("are Panitia WAM always, anyone else only on the list", () => {
    expect(isTester({ roles: ["panitia"] }, false)).toBe(true);
    // Pra WAM's admin role no longer makes a penguji (Main WAM's roles never carry it).
    expect(isTester({ roles: ["admin"] }, false)).toBe(false);
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

  it("gives the panitia tools to Panitia WAM only, and Momen to everyone", () => {
    for (const action of ["kelola", "silent-kontrol"] as const) {
      expect(mainWamCan(panitia, action)).toBe(true);
      expect(mainWamCan(admin, action)).toBe(false);
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

describe("the Panitia tab", () => {
  it("is for someone who really is panitia: not a peserta, a BOD or an admin who is not panitia", () => {
    expect(showsCommitteeTab({ roles: [] })).toBe(false);
    expect(showsCommitteeTab({ roles: ["bod"] })).toBe(false);
    expect(showsCommitteeTab({ roles: ["admin"] })).toBe(false);
    expect(showsCommitteeTab({ roles: ["ga"] })).toBe(false);
    expect(showsCommitteeTab({ roles: ["panitia"] })).toBe(true);
    expect(showsCommitteeTab({ roles: ["admin", "panitia"] })).toBe(true);
  });

  it("goes with the page's gate: whoever the tab is for may open the hub", () => {
    for (const roles of [["panitia"], ["admin", "panitia"], ["bod", "panitia"]] as const) {
      expect(showsCommitteeTab({ roles: [...roles] })).toBe(true);
      expect(mainWamCan({ roles: [...roles] }, "kelola")).toBe(true);
    }
  });
});

describe("Silent Meeting is off by default (Pra WAM's, not Main WAM's)", () => {
  it("every module starts off, Silent Meeting included, and an action of it is refused until it is switched on", () => {
    expect(DEFAULT_MODULES.silent).toBe(false);
    expect(moduleAllows({ roles: [] }, "silent-kirim", DEFAULT_MODULES)).toBe(false);
    expect(moduleAllows({ roles: ["panitia"] }, "silent-kontrol", DEFAULT_MODULES)).toBe(false);
    expect(moduleAllows({ roles: ["bod"] }, "silent-rekap", DEFAULT_MODULES)).toBe(false);
    expect(moduleAllows({ roles: [] }, "silent-kirim", { ...DEFAULT_MODULES, silent: true })).toBe(true);
  });
});
