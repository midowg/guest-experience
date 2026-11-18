import { describe, expect, it } from "vitest";
import { mainWamCan, mainWamRole, showsCommitteeTab } from "./access";
import {
  DEMO_ROLE_COOKIE, DEMO_WRITE_MESSAGE, demoRoleCookie, demoRoles, demoViewer, effectiveModules, isSimulated, ownDemoRole, parseDemoRole, sampleOnlyFor, sampleShiftDays, shiftSample, wibToday,
} from "./demo";
import { demoAttendeeIds, demoSample, samplePresence, settingsForDemo } from "./demo-sample";
import { sampleSessionIds, sampleSessions } from "./sample";
import { defaultSettings, parseModuleConfig, settingsInputSchema, settingsPatch } from "./settings";
import type { MainWamViewer, ModuleSwitches } from "./types";

/* Mode demo's rules, pure (docs/main-wam/KONTRAK.md §12): the flag, the role drawn, what stays real, the sample's clock. */

const modules = (on: Partial<ModuleSwitches>): ModuleSwitches => ({ ...defaultSettings().modules, ...on });

describe("the flag (module_config.demo, no migration)", () => {
  it("is off by default and only `true` turns it on", () => {
    expect(defaultSettings().moduleConfig.demo).toBe(false);
    expect(parseModuleConfig({}).demo).toBe(false);
    for (const odd of ["true", 1, "ya", null, {}]) expect(parseModuleConfig({ demo: odd }).demo).toBe(false);
    expect(parseModuleConfig({ demo: true }).demo).toBe(true);
  });

  it("is saved by Admin without touching the other module settings, and is checked as a boolean", () => {
    const current = defaultSettings();
    const patch = settingsPatch(current, settingsInputSchema.parse({ moduleConfig: { demo: true } })) as { module_config: ReturnType<typeof parseModuleConfig> };
    expect(patch.module_config).toEqual({ ...current.moduleConfig, demo: true });
    // A survey change keeps the flag as it was saved.
    const on = { ...current, moduleConfig: { ...current.moduleConfig, demo: true } };
    expect((settingsPatch(on, settingsInputSchema.parse({ moduleConfig: { survei: { formSlug: null } } })) as { module_config: { demo: boolean } }).module_config.demo).toBe(true);
    expect(settingsInputSchema.safeParse({ moduleConfig: { demo: "ya" } }).success).toBe(false);
  });
});

describe("the modules while the demo is on", () => {
  it("shows every module on except Silent Meeting (it is Pra WAM's), and never rewrites the saved choice", () => {
    const saved = modules({ absen: true });
    const shown = effectiveModules(saved, true);
    expect(shown).toMatchObject({ absen: true, voting: true, survei: true, mozaik: true, karbon: true, silent: false });
    expect(saved.voting).toBe(false);
    expect(effectiveModules(modules({ silent: true }), true).silent).toBe(true);
  });

  it("is the saved choice itself, untouched, when the demo is off", () => {
    const saved = modules({ mozaik: true });
    expect(effectiveModules(saved, false)).toBe(saved);
  });
});

describe("the role drawn (Lihat sebagai)", () => {
  it("parses the cookie: only the three roles count", () => {
    expect(parseDemoRole("panitia")).toBe("panitia");
    for (const odd of [null, undefined, "", "admin", "BOD", "x"]) expect(parseDemoRole(odd)).toBeNull();
    expect(DEMO_ROLE_COOKIE).toBe("mw_demo_role");
  });

  it("writes a cookie for the whole site (the APIs read it too) and an expired one to forget the choice", () => {
    expect(demoRoleCookie("bod", true)).toBe("mw_demo_role=bod; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
    expect(demoRoleCookie(null, false)).toBe("mw_demo_role=; Path=/; Max-Age=0; SameSite=Lax");
  });

  it("draws a penguji as the role they picked: a peserta account as Panitia gets the Panitia tab and the panitia's rights, simulated", () => {
    const { roles, demo } = demoViewer({ roles: [], tester: true }, "panitia");
    expect(roles).toEqual(["panitia"]);
    expect(demo).toEqual({ canSwitch: true, role: "panitia", simulated: true, realRoles: [] });
    expect(showsCommitteeTab({ roles })).toBe(true);
    expect(mainWamCan({ roles }, "kelola")).toBe(true);
    expect(mainWamRole({ roles: demoRoles("bod") })).toBe("bod");
    expect(mainWamCan({ roles: demoRoles("bod") }, "ringkasan")).toBe(true);
    expect(mainWamCan({ roles: demoRoles("peserta") }, "kelola")).toBe(false);
  });

  it("keeps the account's own roles until a role is picked, and shows the switch to a penguji only", () => {
    expect(demoViewer({ roles: ["panitia"], tester: true }, null)).toEqual({ roles: ["panitia"], demo: { canSwitch: true, role: "panitia", simulated: false, realRoles: ["panitia"] } });
    expect(demoViewer({ roles: ["admin"], tester: true }, null).demo.role).toBe("peserta");
    // Not a penguji: no switch, and a cookie (anyone can write one) changes nothing.
    expect(demoViewer({ roles: [], tester: false }, "panitia")).toEqual({ roles: [], demo: { canSwitch: false, role: "peserta", simulated: false, realRoles: [] } });
    expect(ownDemoRole(["bod", "panitia"])).toBe("bod");
  });

  it("is not simulated when the pick is what the account is; an admin drawn as Peserta is", () => {
    expect(demoViewer({ roles: ["panitia"], tester: true }, "panitia").demo.simulated).toBe(false);
    expect(demoViewer({ roles: ["bod"], tester: true }, "bod").demo.simulated).toBe(false);
    expect(demoViewer({ roles: ["panitia"], tester: true }, "peserta").demo.simulated).toBe(true);
    expect(demoViewer({ roles: ["admin"], tester: true }, "peserta").demo.simulated).toBe(true);
    expect(demoViewer({ roles: [], tester: true }, "peserta").demo.simulated).toBe(false);
  });

  it("reads real panitia or BOD data only when the account really has the right (sample otherwise)", () => {
    const drawn = (roles: MainWamViewer["roles"], pick: "peserta" | "panitia" | "bod") => ({ demo: demoViewer({ roles, tester: true }, pick).demo });
    expect(sampleOnlyFor(drawn([], "panitia"), "kelola")).toBe(true);
    expect(sampleOnlyFor(drawn(["panitia"], "panitia"), "kelola")).toBe(false);
    expect(sampleOnlyFor(drawn(["admin"], "panitia"), "kelola")).toBe(false);
    expect(sampleOnlyFor(drawn(["panitia"], "bod"), "ringkasan")).toBe(true);
    // Without the demo there is nothing to ask: nothing changes.
    expect(sampleOnlyFor({}, "kelola")).toBe(false);
    expect(isSimulated({})).toBe(false);
    expect(DEMO_WRITE_MESSAGE).toContain("tidak disimpan");
  });
});

describe("the sample's clock", () => {
  const now = new Date("2026-11-18T03:00:00Z"); // 10.00 WIB

  it("moves the sample so its second day is today (WIB)", () => {
    expect(wibToday(now)).toBe("2026-11-18");
    expect(wibToday(new Date("2026-11-18T18:30:00Z"))).toBe("2026-11-19");
    const days = sampleShiftDays(now);
    expect(days).toBe(-48);
    const moved = demoSample(sampleSessions, now);
    const pemaparan = moved.find(session => session.id === sampleSessionIds.pemaparan)!;
    expect(pemaparan.startsAt).toBe("2026-11-18T08:00:00+07:00");
    expect(moved[0].startsAt).toBe("2026-11-17T05:30:00+07:00");
  });

  it("moves dates and instants only, deep, and leaves everything else and the original alone", () => {
    const value = { date: "2027-01-05", at: "2027-01-05T10:20:00+07:00", other: "Sel, 5 Jan", list: [{ at: "2027-01-07T08:00:00+07:00" }], n: 3, no: null };
    expect(shiftSample(value, 1)).toEqual({ date: "2027-01-06", at: "2027-01-06T10:20:00+07:00", other: "Sel, 5 Jan", list: [{ at: "2027-01-08T08:00:00+07:00" }], n: 3, no: null });
    expect(value.date).toBe("2027-01-05");
    expect(shiftSample(value, 0)).toBe(value);
  });
});

describe("the settings as the demo draws them", () => {
  const now = new Date("2026-11-18T03:00:00Z");

  it("turns every module on and publishes kelompok, fills what is empty, keeps what Admin set, and never changes the saved settings", () => {
    const saved = { ...defaultSettings(), migrated: true, moduleConfig: { ...defaultSettings().moduleConfig, demo: true }, modules: modules({ absen: true }) };
    const shown = settingsForDemo(saved, true, now);
    expect(shown.modules).toMatchObject({ absen: true, voting: true, mozaik: true, karbon: true, survei: true, silent: false });
    expect(shown.groupsPublished).toBe(true);
    expect(shown.sampleRundown).toBe(true);
    // The event follows the sample rundown, which is moved to today.
    expect(shown.event).toMatchObject({ startDate: "2026-11-17", endDate: "2026-11-20" });
    expect(shown.event.hotel).not.toBe("");
    expect(shown.carbon.listrikKwh).not.toBeNull();
    expect(shown.contacts.umum).not.toBeNull();
    expect(saved.modules.voting).toBe(false);
    expect(saved.groupsPublished).toBe(false);
    expect(saved.event.hotel).toBe("");
  });

  it("keeps the real dates when there is a real rundown, and the hotel and bills Admin filled in", () => {
    const saved = { ...defaultSettings(), moduleConfig: { ...defaultSettings().moduleConfig, demo: true }, event: { ...defaultSettings().event, hotel: "Hotel Asli" }, carbon: { listrikKwh: 10, airM3: null, lpgKg: null, sampahKg: null, final: false } };
    const shown = settingsForDemo(saved, false, now);
    expect(shown.sampleRundown).toBe(false);
    expect(shown.event.startDate).toBe("2027-01-04");
    expect(shown.event.hotel).toBe("Hotel Asli");
    expect(shown.carbon).toEqual(saved.carbon);
  });
});

describe("the sample's check-ins", () => {
  it("are most of the people but not BOD, the same every time, and different per session", () => {
    const first = samplePresence(sampleSessionIds.pemaparan);
    expect(samplePresence(sampleSessionIds.pemaparan)).toEqual(first);
    const people = demoAttendeeIds();
    expect(first.length).toBeGreaterThan(people.length * 0.6);
    expect(first.length).toBeLessThanOrEqual(people.length);
    expect(first.every(row => people.includes(row.employeeId))).toBe(true);
    expect(samplePresence(sampleSessionIds.kumpul).length).not.toBe(first.length);
    expect(samplePresence("00000000-0000-4000-8000-000000000000")).toEqual([]);
  });
});
