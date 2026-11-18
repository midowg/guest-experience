import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamSettings, MainWamViewer } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";

/* The gate in Mode demo: the account's real rights decide; a role drawn is read-only; without the demo nothing changes. */

let settings: MainWamSettings;
let viewer: MainWamViewer | null;
let origin: string | null;

vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(origin ? { origin } : {}), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => "x".repeat(40) }));
vi.mock("./settings", () => ({ readMainWamSettings: async () => settings }));
vi.mock("./viewer", () => ({ mainWamViewer: async () => viewer, testsMainWam: async () => false, viewerRoom: async () => null }));
vi.mock("../pra-wam/session", () => ({ currentMember: async () => null }));

const gate = await import("./gate");

const base = { id: "11111111-1111-4111-8111-111111111111", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, group: null, room: null };
const asPanitia = (realRoles: MainWamViewer["roles"], simulated: boolean): MainWamViewer => ({
  ...base, roles: ["panitia"], tester: true, demo: { canSwitch: true, role: "panitia", simulated, realRoles },
});
const withSettings = (demo: boolean, sampleRundown = false) => {
  settings = { ...defaultSettings(), migrated: true, mode: "semua", moduleConfig: { ...defaultSettings().moduleConfig, demo }, sampleRundown };
};
const status = (promise: Promise<unknown>) => promise.then(() => 200, (error: { status?: number; message?: string }) => error.status ?? error.message);

beforeEach(() => { withSettings(true); viewer = null; origin = null; });

describe("a role drawn in Mode demo", () => {
  it("opens the panitia tool for a peserta account drawn as panitia, to read (a GET has no Origin)", async () => {
    viewer = asPanitia([], true);
    await expect(gate.requireActionPage("kelola", mainWamPath.committee)).resolves.toBeTruthy();
    expect(await status(gate.requireActionApi("kelola"))).toBe(200);
  });

  it("refuses its writes, kindly, before anything is saved (every write carries the site's Origin)", async () => {
    viewer = asPanitia([], true);
    origin = "https://journey.example";
    const result = await gate.requireActionApi("kelola").catch((error: { status: number; message: string }) => error);
    expect(result).toMatchObject({ status: 403 });
    expect((result as { message: string }).message).toContain("tidak disimpan");
  });

  it("does not refuse a person who is panitia in fact (not simulated), nor anyone with the demo off", async () => {
    origin = "https://journey.example";
    viewer = asPanitia(["panitia"], false);
    expect(await status(gate.requireActionApi("kelola"))).toBe(200);
    withSettings(false);
    viewer = { ...base, roles: ["panitia"], tester: true };
    expect(await status(gate.requireActionApi("kelola"))).toBe(200);
  });

  it("refuses everyone's writes while the sample rundown stands in (every id on screen is a sample's)", async () => {
    withSettings(true, true);
    origin = "https://journey.example";
    viewer = { ...base, roles: [], tester: false, demo: { canSwitch: false, role: "peserta", simulated: false, realRoles: [] } };
    expect(await status(gate.requireMainWamApi())).toBe(403);
    origin = null;
    expect(await status(gate.requireMainWamApi())).toBe(200);
  });
});

describe("the real rights stay the server's", () => {
  it("a peserta who is not a penguji never gets a panitia page or API, demo or not (the cookie is ignored by the viewer)", async () => {
    viewer = { ...base, roles: [], tester: false, demo: { canSwitch: false, role: "peserta", simulated: false, realRoles: [] } };
    await expect(gate.requireActionPage("kelola", mainWamPath.committee)).rejects.toThrow("NOT_FOUND");
    expect(await status(gate.requireActionApi("kelola"))).toBe(404);
    expect(await status(gate.requireActionApi("ringkasan"))).toBe(404);
  });

  it("without the demo, a viewer with no demo part is gated exactly as before", async () => {
    withSettings(false);
    viewer = { ...base, roles: [], tester: false };
    expect(await status(gate.requireActionApi("kelola"))).toBe(404);
    origin = "https://journey.example";
    expect(await status(gate.requireMainWamApi())).toBe(200);
  });

  it("gives a drawn viewer a sample room while HR has not published one", async () => {
    viewer = { ...base, name: "Budi", roles: [], tester: true, demo: { canSwitch: true, role: "peserta", simulated: false, realRoles: [] } };
    const context = await gate.requireMainWamPage(mainWamPath.me);
    // The sample room, with the viewer's own name on their line.
    expect(context.viewer.room?.people.find(person => person.me)?.name).toBe("Budi");
  });
});
