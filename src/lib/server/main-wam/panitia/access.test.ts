import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamSettings, MainWamViewer, ModuleSwitches } from "@/lib/main-wam/types";

/*
 * Who may open area C (tes wajib): the panitia tools (K02–K08) only Panitia WAM (20 Nov 2026: Main WAM's
 * "panitia" role, from pw_event_staff; Pra WAM's panitia or admin role is not enough), BOD's
 * Ringkasan and Kehadiran (B01–B02) only BOD; everyone else gets "not found", on the pages and in
 * the APIs. A tool of a module that is off (Absen, Kehadiran) does not exist either. The data
 * readers are stubbed: only the gates are under test.
 */

let settings: MainWamSettings;
let viewer: MainWamViewer | null;

vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => "x".repeat(40) }));
vi.mock("@/lib/server/main-wam/settings", () => ({ readMainWamSettings: async () => settings }));
vi.mock("@/lib/server/main-wam/viewer", () => ({ mainWamViewer: async () => viewer, testsMainWam: async () => false }));
vi.mock("@/lib/server/pra-wam/session", () => ({ currentMember: async () => null }));
vi.mock("./common", async importOriginal => ({ ...(await importOriginal<typeof import("./common")>()), limitPerPerson: async () => undefined }));
vi.mock("./rundown", () => ({ rundownLiveData: async () => ({}), changeSession: async () => ({ changed: 1, notified: false, recipients: 0, versions: {} }), rundownHistory: async () => ({ migrated: true, history: [] }) }));
vi.mock("./attendance", () => ({ attendanceData: async () => ({ session: null }), sessionRows: async () => ({ rows: [], migrated: true }), setAttendance: async () => ({ rows: [] }) }));
vi.mock("./announce", () => ({ announceData: async () => ({}), listSent: async () => ({ migrated: true, sent: [] }), sendAnnouncement: async () => 3, unpinAnnouncement: async () => undefined, removeAnnouncement: async () => undefined }));
vi.mock("./moderation", () => ({ moderationData: async () => ({}), moderatePhoto: async () => undefined, waitingCount: async () => 0 }));
vi.mock("./summary", () => ({ bodSummary: async () => ({ migrated: true, rows: [] }), attendanceDay: async () => ({}), panitiaHome: async () => ({ tiles: [], attention: [], reported: 0, running: [] }) }));

const ID = "00000000-0000-4000-8004-000000000010";
const person = (roles: MainWamViewer["roles"]): MainWamViewer => ({ id: "11111111-1111-4111-8111-111111111111", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles, tester: roles.includes("panitia") || roles.includes("admin"), group: null, room: null });
const allOn: ModuleSwitches = { absen: true, voting: true, silent: true, survei: true, mozaik: true, karbon: true, kuis: true, ceklis: true, misi: true };
const withModules = (modules: Partial<ModuleSwitches> = {}) => { settings = { ...defaultSettings(), migrated: true, mode: "semua", modules: { ...allOn, ...modules } }; };
// `admin`: a viewer still carrying Pra WAM's admin role (Main WAM's roles never do, mainWamRolesOf): it opens nothing.
const PEOPLE = { peserta: person([]), panitia: person(["panitia"]), admin: person(["admin"]), bod: person(["bod"]) };

const url = "http://localhost:3100/api/wam/acara/x";
const json = (method: string, body: unknown) => new Request(url, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3100" }, body: JSON.stringify(body) });
const params = <K extends string>(key: K) => ({ params: Promise.resolve({ [key]: ID } as Record<K, string>) });

const rundownRoute = await import("@/app/api/wam/acara/kelola/rundown/[id]/route");
const historyRoute = await import("@/app/api/wam/acara/kelola/rundown/riwayat/route");
const absenRoute = await import("@/app/api/wam/acara/kelola/absen/[sesiId]/route");
const announceRoute = await import("@/app/api/wam/acara/kelola/pengumuman/route");
const announcementRoute = await import("@/app/api/wam/acara/kelola/pengumuman/[id]/route");
const moderationRoute = await import("@/app/api/wam/acara/kelola/moderasi/route");
const moderateRoute = await import("@/app/api/wam/acara/kelola/moderasi/[id]/route");
const summaryRoute = await import("@/app/api/wam/acara/ringkasan/route");

/** Every panitia API, called as a well-formed request. */
const panitiaCalls: [string, () => Promise<Response>][] = [
  ["PATCH rundown", () => rundownRoute.PATCH(json("PATCH", { action: "batal", version: "2027-01-05T00:00:00+00:00", notify: false }), params("id"))],
  ["GET riwayat", () => historyRoute.GET()],
  ["GET absen", () => absenRoute.GET(new Request(url), params("sesiId"))],
  ["POST absen", () => absenRoute.POST(json("POST", { employeeId: ID, present: true }), params("sesiId"))],
  ["GET pengumuman", () => announceRoute.GET()],
  ["POST pengumuman", () => announceRoute.POST(json("POST", { title: "Kumpul", audience: { type: "semua" } }))],
  ["PATCH pengumuman", () => announcementRoute.PATCH(json("PATCH", { pinnedUntil: null }), params("id"))],
  ["DELETE pengumuman", () => announcementRoute.DELETE(new Request(url, { method: "DELETE", headers: { Origin: "http://localhost:3100" } }), params("id"))],
  ["GET moderasi", () => moderationRoute.GET()],
  ["POST moderasi", () => moderateRoute.POST(json("POST", { action: "tampilkan", from: "tampil" }), params("id"))],
];

beforeEach(() => { withModules(); viewer = null; });

describe("area C's APIs", () => {
  it("answer 401 without a session", async () => {
    for (const [name, call] of [...panitiaCalls, ["GET ringkasan", () => summaryRoute.GET()] as const]) expect((await call()).status, name).toBe(401);
  });

  it("do not exist for peserta, BOD and Pra WAM's admin role (panitia tools), and work for Panitia WAM", async () => {
    for (const who of ["peserta", "bod", "admin"] as const) {
      viewer = PEOPLE[who];
      for (const [name, call] of panitiaCalls) expect((await call()).status, `${who} ${name}`).toBe(404);
    }
    viewer = PEOPLE.panitia;
    for (const [name, call] of panitiaCalls) expect((await call()).status, `panitia ${name}`).toBe(200);
  });

  it("Ringkasan exists for BOD only", async () => {
    for (const who of ["peserta", "panitia", "admin"] as const) { viewer = PEOPLE[who]; expect((await summaryRoute.GET()).status, who).toBe(404); }
    viewer = PEOPLE.bod;
    expect((await summaryRoute.GET()).status).toBe(200);
  });

  it("Absen manual does not exist while module Absen QR is off", async () => {
    viewer = PEOPLE.panitia;
    withModules({ absen: false });
    expect((await absenRoute.GET(new Request(url), params("sesiId"))).status).toBe(404);
    expect((await absenRoute.POST(json("POST", { employeeId: ID, present: true }), params("sesiId"))).status).toBe(404);
  });

  it("refuse a write from another site, and a body it does not know", async () => {
    viewer = PEOPLE.panitia;
    const foreign = new Request(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.invalid" }, body: JSON.stringify({ title: "Kumpul", audience: { type: "semua" } }) });
    expect((await announceRoute.POST(foreign)).status).toBe(403);
    expect((await rundownRoute.PATCH(json("PATCH", { action: "hapus" }), params("id"))).status).toBe(422);
    expect((await moderateRoute.POST(json("POST", { action: "blokir", from: "tampil" }), params("id"))).status).toBe(422);
  });
});

describe("area C's pages", () => {
  const search = (values: Record<string, string> = {}) => ({ searchParams: Promise.resolve(values) });
  const pages = {
    hub: async () => (await import("@/app/wam/acara/(app)/kelola/page")).default(),
    rundown: async () => (await import("@/app/wam/acara/(app)/kelola/rundown/page")).default(search()),
    absen: async () => (await import("@/app/wam/acara/(app)/kelola/absen/page")).default(search()),
    pengumuman: async () => (await import("@/app/wam/acara/(app)/kelola/pengumuman/page")).default(),
    moderasi: async () => (await import("@/app/wam/acara/(app)/kelola/moderasi/page")).default(search()),
  };
  const kehadiran = async () => (await import("@/app/wam/acara/(app)/ringkasan/kehadiran/page")).default(search({ hari: "3" }));
  const outcome = (promise: Promise<unknown>) => promise.then(() => "OK", (error: Error) => error.message);

  it("send someone not signed in to sign in, coming back", async () => {
    expect(await outcome(pages.rundown())).toMatch(/^REDIRECT .*masuk/);
  });

  it("panitia tools: not found for peserta, BOD and Pra WAM's admin role, open for Panitia WAM", async () => {
    for (const [name, page] of Object.entries(pages)) {
      viewer = PEOPLE.peserta;
      expect(await outcome(page()), `peserta ${name}`).toBe("NOT_FOUND");
      viewer = PEOPLE.bod;
      expect(await outcome(page()), `bod ${name}`).toBe("NOT_FOUND");
      viewer = PEOPLE.panitia;
      expect(await outcome(page()), `panitia ${name}`).toBe("OK");
      viewer = PEOPLE.admin;
      expect(await outcome(page()), `admin ${name}`).toBe("NOT_FOUND");
    }
  });

  it("Kehadiran: BOD only, and not while Absen QR is off; Absen sesi not while it is off", async () => {
    for (const who of ["peserta", "panitia", "admin"] as const) { viewer = PEOPLE[who]; expect(await outcome(kehadiran()), who).toBe("NOT_FOUND"); }
    viewer = PEOPLE.bod;
    expect(await outcome(kehadiran())).toBe("OK");
    withModules({ absen: false });
    expect(await outcome(kehadiran())).toBe("NOT_FOUND");
    viewer = PEOPLE.panitia;
    expect(await outcome(pages.absen())).toBe("NOT_FOUND");
  });
});

describe("Beranda slots", () => {
  it("draw nothing for someone the card is not for", async () => {
    const { BerandaBod } = await import("@/components/main-wam/panitia/BerandaBod");
    const now = new Date("2027-01-05T10:15:00+07:00");
    viewer = PEOPLE.peserta;
    expect(await BerandaBod({ context: { viewer: PEOPLE.peserta, settings }, now })).toBeNull();
    expect(await BerandaBod({ context: { viewer: PEOPLE.panitia, settings }, now })).toBeNull();
    expect(await BerandaBod({ context: { viewer: PEOPLE.bod, settings }, now })).not.toBeNull();
    // Every module off: BOD's card has no row left, so no card.
    expect(await BerandaBod({ context: { viewer: PEOPLE.bod, settings: { ...settings, modules: { ...allOn, absen: false, voting: false, silent: false, karbon: false } } }, now })).toBeNull();
  });
});
