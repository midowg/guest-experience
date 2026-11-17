import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamMode, MainWamSettings, MainWamViewer, ModuleSwitches } from "@/lib/main-wam/types";
import { mainWamPath, praWamPath } from "@/lib/routes";

/* The gate of every Main WAM page and API, and where /wam goes, for each mode and person. */

let settings: MainWamSettings;
let viewer: MainWamViewer | null;
let member: { id: string; roles: string[] } | null;
let tester = false;
let settingsFail = false;

vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => "x".repeat(40) }));
vi.mock("./settings", () => ({ readMainWamSettings: async () => { if (settingsFail) throw new Error("db down"); return settings; } }));
vi.mock("./viewer", () => ({ mainWamViewer: async () => viewer, testsMainWam: async () => tester }));
vi.mock("../pra-wam/session", () => ({ currentMember: async () => member }));

const gate = await import("./gate");

const person = (roles: MainWamViewer["roles"], isTester: boolean): MainWamViewer => ({ id: "11111111-1111-4111-8111-111111111111", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles, tester: isTester, group: null, room: null });
const withMode = (mode: MainWamMode, modules: Partial<ModuleSwitches> = {}) => { settings = { ...defaultSettings(), migrated: true, mode, modules: { ...defaultSettings().modules, ...modules } }; };
const status = async (promise: Promise<unknown>) => promise.then(() => 200, (error: { status?: number; message?: string }) => error.status ?? error.message);

beforeEach(() => { withMode("pra"); viewer = null; member = null; tester = false; settingsFail = false; });

describe("a Main WAM page", () => {
  const here = mainWamPath.agenda();

  it("sends a stranger to sign in, coming back here: Main WAM's page only in mode semua", async () => {
    withMode("semua");
    await expect(gate.requireMainWamPage(here)).rejects.toThrow(`REDIRECT ${mainWamPath.login(here)}`);
    withMode("uji");
    await expect(gate.requireMainWamPage(here)).rejects.toThrow(`REDIRECT ${praWamPath.login(here)}`);
    withMode("pra");
    await expect(gate.requireMainWamPage(here)).rejects.toThrow(`REDIRECT ${praWamPath.login(here)}`);
  });

  it("does not exist for someone it is not on for (mode pra and uji), and opens for a penguji", async () => {
    viewer = person([], false);
    for (const mode of ["pra", "uji"] as const) { withMode(mode); await expect(gate.requireMainWamPage(here)).rejects.toThrow("NOT_FOUND"); }
    withMode("semua");
    await expect(gate.requireMainWamPage(here)).resolves.toMatchObject({ viewer: { name: "Rani" } });
    viewer = person(["panitia"], true);
    for (const mode of ["pra", "uji", "semua"] as const) { withMode(mode); await expect(gate.requireMainWamPage(here)).resolves.toMatchObject({ settings: { mode } }); }
  });

  it("of a module that is off does not exist", async () => {
    viewer = person([], true);
    withMode("uji");
    await expect(gate.requireModulePage("voting", mainWamPath.awards)).rejects.toThrow("NOT_FOUND");
    withMode("uji", { voting: true });
    await expect(gate.requireModulePage("voting", mainWamPath.awards)).resolves.toBeTruthy();
  });

  it("of a role's tool does not exist for another role", async () => {
    withMode("semua");
    viewer = person([], false);
    await expect(gate.requireActionPage("kelola", mainWamPath.rundownLive())).rejects.toThrow("NOT_FOUND");
    viewer = person(["panitia"], true);
    await expect(gate.requireActionPage("kelola", mainWamPath.rundownLive())).resolves.toBeTruthy();
    viewer = person(["bod"], false);
    await expect(gate.requireActionPage("ringkasan", mainWamPath.attendanceSummary())).resolves.toBeTruthy();
  });
});

describe("a Main WAM API", () => {
  it("answers 401 without a session and 404 where Main WAM is not on", async () => {
    withMode("semua");
    expect(await status(gate.requireMainWamApi())).toBe(401);
    viewer = person([], false);
    withMode("uji");
    expect(await status(gate.requireMainWamApi())).toBe(404);
    withMode("semua");
    expect(await status(gate.requireMainWamApi())).toBe(200);
  });

  it("answers 404 for a module that is off (no trace) and 403 for a role that may not", async () => {
    withMode("semua");
    viewer = person(["bod"], false);
    expect(await status(gate.requireModuleApi("silent"))).toBe(404);
    expect(await status(gate.requireActionApi("silent-kirim"))).toBe(403);
    withMode("semua", { silent: true });
    expect(await status(gate.requireActionApi("silent-kirim"))).toBe(403);
    expect(await status(gate.requireActionApi("silent-rekap"))).toBe(200);
    viewer = person([], false);
    expect(await status(gate.requireActionApi("silent-kirim"))).toBe(200);
    withMode("semua");
    expect(await status(gate.requireActionApi("silent-kirim"))).toBe(404);
  });
});

describe("/wam (Pra WAM's Beranda)", () => {
  it("stays Pra WAM in mode pra for everyone (Pra WAM's behaviour unchanged)", async () => {
    member = { id: "m", roles: ["admin"] }; tester = true;
    expect(await gate.mainWamHomeTarget({})).toBeNull();
    member = null;
    expect(await gate.mainWamHomeTarget({})).toBeNull();
  });

  it("opens Main WAM in mode uji for penguji only", async () => {
    withMode("uji");
    member = { id: "m", roles: [] }; tester = true;
    expect(await gate.mainWamHomeTarget({})).toBe(mainWamPath.home);
    tester = false;
    expect(await gate.mainWamHomeTarget({})).toBeNull();
    member = null;
    expect(await gate.mainWamHomeTarget({})).toBeNull();
  });

  it("opens Main WAM in mode semua for everyone, signed in or not", async () => {
    withMode("semua");
    expect(await gate.mainWamHomeTarget({})).toBe(mainWamPath.home);
    member = { id: "m", roles: [] };
    expect(await gate.mainWamHomeTarget({})).toBe(mainWamPath.home);
    await expect(gate.redirectToMainWam({})).rejects.toThrow(`REDIRECT ${mainWamPath.home}`);
  });

  it("keeps Pra WAM reachable by its address (?versi=pra), and Pra WAM on any failure", async () => {
    withMode("semua");
    expect(await gate.mainWamHomeTarget({ versi: "pra" })).toBeNull();
    expect(praWamPath.homePra).toBe("/wam?versi=pra");
    await expect(gate.redirectToMainWam({ versi: "pra" })).resolves.toBeUndefined();
    settingsFail = true;
    expect(await gate.mainWamHomeTarget({})).toBeNull();
  });
});
