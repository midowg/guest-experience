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
const viewerRoom = vi.fn(async () => ({ id: "r1", name: "208", kind: "kamar", floor: "2", note: "", people: [] }));
vi.mock("./viewer", () => ({ mainWamViewer: async () => viewer, testsMainWam: async () => tester, viewerRoom }));
vi.mock("../pra-wam/session", () => ({ currentMember: async () => member }));
/** Main WAM shown in Journey by the super admin (the other tests); hidden: /wam never leaves Pra WAM. */
let shown = true;
vi.mock("../main-wam-visibility", () => ({ getMainWamVisibility: async () => ({ shown, migrated: true, changedAt: null, changedBy: null }) }));

const gate = await import("./gate");

const person = (roles: MainWamViewer["roles"], isTester: boolean): MainWamViewer => ({ id: "11111111-1111-4111-8111-111111111111", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles, tester: isTester, group: null, room: null });
const withMode = (mode: MainWamMode, modules: Partial<ModuleSwitches> = {}) => { settings = { ...defaultSettings(), migrated: true, mode, modules: { ...defaultSettings().modules, ...modules } }; };
const status = async (promise: Promise<unknown>) => promise.then(() => 200, (error: { status?: number; message?: string }) => error.status ?? error.message);

beforeEach(() => { withMode("pra"); viewer = null; member = null; tester = false; settingsFail = false; shown = true; });

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

describe("the room (S5: read only where it shows)", () => {
  it("Saya and below get the room; every other page leaves it null and never reads it", async () => {
    withMode("semua");
    viewer = person([], false);
    viewerRoom.mockClear();
    expect((await gate.requireMainWamPage(mainWamPath.agenda())).viewer.room).toBeNull();
    expect((await gate.requireMainWamPage(mainWamPath.home)).viewer.room).toBeNull();
    expect(viewerRoom).not.toHaveBeenCalled();
    for (const here of [mainWamPath.me, mainWamPath.room, mainWamPath.travel("pulang")]) {
      expect((await gate.requireMainWamPage(here)).viewer.room).toMatchObject({ name: "208" });
    }
    expect(viewerRoom).toHaveBeenCalledTimes(3);
  });
});

describe("whether Main WAM shows at all (M6: theme, KV, frame, loading)", () => {
  it("mode pra/uji: only to a signed-in penguji; never to a stranger or another member", async () => {
    for (const mode of ["pra", "uji"] as const) {
      withMode(mode);
      viewer = null;
      expect(await gate.mainWamShown()).toBe(false);
      viewer = person([], false);
      expect(await gate.mainWamShown()).toBe(false);
      viewer = person(["panitia"], true);
      expect(await gate.mainWamShown()).toBe(true);
    }
  });

  it("mode semua: to everyone, the sign-in page too; on a failure: hidden", async () => {
    withMode("semua");
    viewer = null;
    expect(await gate.mainWamShown()).toBe(true);
    viewer = person([], false);
    expect(await gate.mainWamShown()).toBe(true);
    settingsFail = true;
    expect(await gate.mainWamShown()).toBe(false);
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

  it("answers 404 for anyone it is not for: a module that is off, and a role that may not (one answer, no trace)", async () => {
    withMode("semua");
    viewer = person(["bod"], false);
    expect(await status(gate.requireModuleApi("silent"))).toBe(404);
    expect(await status(gate.requireActionApi("silent-kirim"))).toBe(404);
    withMode("semua", { silent: true });
    expect(await status(gate.requireActionApi("silent-kirim"))).toBe(404);
    viewer = person([], false);
    expect(await status(gate.requireActionApi("silent-kontrol"))).toBe(404);
    expect(await status(gate.requireActionApi("silent-rekap"))).toBe(404);
    viewer = person(["bod"], false);
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

  it("never leaves Pra WAM while Main WAM is hidden from Journey, whatever the mode; Main WAM still opens by its address", async () => {
    shown = false;
    for (const mode of ["pra", "uji", "semua"] as const) {
      withMode(mode);
      member = { id: "m", roles: ["admin"] }; tester = true;
      expect(await gate.mainWamHomeTarget({}), mode).toBeNull();
      member = null;
      expect(await gate.mainWamHomeTarget({}), mode).toBeNull();
    }
    await expect(gate.redirectToMainWam({})).resolves.toBeUndefined();
    // The gate of Main WAM's own pages is not changed: a penguji opens it by its address (mode uji).
    withMode("uji");
    viewer = person([], true);
    expect(await gate.requireMainWamPage(mainWamPath.home)).toMatchObject({ viewer: { tester: true } });
    shown = true;
    member = { id: "m", roles: [] }; tester = true;
    expect(await gate.mainWamHomeTarget({})).toBe(mainWamPath.home);
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
