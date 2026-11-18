import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleSessionIds, samplePeople } from "@/lib/main-wam/sample";
import type { MainWamSettings, MainWamViewer } from "@/lib/main-wam/types";
import { callsOf, fake, newRequest, type Query } from "./fake-db.test-helper";

/*
 * Mode demo on the server (docs/main-wam/KONTRAK.md §12), against the stand-in database: the settings as
 * drawn, the role a penguji picked, the sample that fills empty tables, and the real read that stays real
 * when the demo is off, when Admin looks, and when there is real data.
 */

vi.mock("server-only", () => ({}));
vi.mock("react", async original => (await import("./fake-db.test-helper")).reactMock(original as () => Promise<typeof import("react")>));
vi.mock("../supabase/admin", async () => (await import("./fake-db.test-helper")).supabaseMock());
vi.mock("../pra-wam/events", () => ({ listEvents: async () => ({ events: [{ id: "ev-wam", kind: "wam", startDate: "2027-01-04", endDate: "2027-01-07" }], migrated: true }) }));
vi.mock("../pra-wam/appraisal", () => ({ listPeople: async () => [{ id: "00000000-0000-4000-8000-0000000000aa", name: "Budi", fullName: "Budi Asli", department: "CoE", active: true }] }));
vi.mock("../pra-wam/questionnaire", () => ({ currentForm: async () => null }));
vi.mock("../pra-wam/session", () => ({ currentMember: async () => null }));
let cookieRole: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "mw_demo_role" && cookieRole ? { value: cookieRole } : undefined) }),
  headers: async () => new Headers(),
}));
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "x");

const REAL = "00000000-0000-4000-8000-0000000000aa";
let demo = true;
let sessionRows: Record<string, unknown>[] = [];
let testers: string[] = [];
let modules: Record<string, boolean> = { absen: true };

function answer(q: Query) {
  switch (q.table) {
    case "mw_settings": return { data: [{ mode: "semua", modules, module_config: { demo } }] };
    case "mw_sessions": return { data: sessionRows, count: sessionRows.length };
    case "mw_testers": return { data: testers.map(employee_id => ({ employee_id })) };
    default: return { data: [] };
  }
}

const settingsModule = await import("./settings");
const viewerModule = await import("./viewer");
const read = await import("./read");
const moderation = await import("./panitia/moderation");
const announce = await import("./panitia/announce");

const member = (roles: string[]) => ({ id: REAL, name: "Budi Asli", nickname: "Budi", department: "CoE", position: "", mustChangePassword: false, roles, photo: null }) as never;

beforeEach(() => {
  newRequest();
  fake.answer = answer;
  demo = true; sessionRows = []; testers = []; modules = { absen: true }; cookieRole = undefined;
});

describe("the settings as the demo draws them", () => {
  it("every module on, kelompok published, the event following the sample rundown while no session is published; Admin's own read stays as saved", async () => {
    const shown = await settingsModule.readMainWamSettings();
    expect(shown.moduleConfig.demo).toBe(true);
    expect(shown.modules).toMatchObject({ absen: true, voting: true, mozaik: true, karbon: true, survei: true });
    expect(shown.groupsPublished).toBe(true);
    expect(shown.sampleRundown).toBe(true);
    const saved = await settingsModule.mainWamSettingsState();
    expect(saved.modules.voting).toBe(false);
    expect(saved.groupsPublished).toBe(false);
    expect(saved.sampleRundown).toBe(false);
  });

  it("keeps the real event once a session is published (only the modules and the sample fallbacks change)", async () => {
    sessionRows = [{ id: "s1", kind: "sesi", status: "terbit", starts_at: "2027-01-04T01:00:00+00:00" }];
    const shown = await settingsModule.readMainWamSettings();
    expect(shown.sampleRundown).toBe(false);
    expect(shown.event.startDate).toBe("2027-01-04");
    expect(shown.modules.voting).toBe(true);
  });

  it("is exactly the saved settings when the demo is off (nothing changes, no extra read of the sessions)", async () => {
    demo = false;
    const shown = await settingsModule.readMainWamSettings();
    expect(shown).toEqual(await settingsModule.mainWamSettingsState());
    expect(shown.modules.voting).toBe(false);
    expect(fake.queries.filter(query => query.table === "mw_sessions")).toHaveLength(0);
  });
});

describe("the role a penguji picked", () => {
  it("draws a penguji (on the list) as the picked role, with the account's real roles kept for the server", async () => {
    testers = [REAL]; cookieRole = "panitia";
    const viewer = await viewerModule.viewerOf(member([]));
    expect(viewer.roles).toEqual(["panitia"]);
    expect(viewer.tester).toBe(true);
    expect(viewer.demo).toEqual({ canSwitch: true, role: "panitia", simulated: true, realRoles: [] });
    // A sample group while there is none of their own.
    expect(viewer.group?.name).toBeTruthy();
  });

  it("ignores the cookie of anyone who is not a penguji (it is only a cookie), and shows them no switch", async () => {
    cookieRole = "bod";
    const viewer = await viewerModule.viewerOf(member([]));
    expect(viewer.roles).toEqual([]);
    expect(viewer.demo).toEqual({ canSwitch: false, role: "peserta", simulated: false, realRoles: [] });
  });

  it("does not exist when the demo is off: the cookie is ignored and the viewer has no demo part", async () => {
    demo = false; testers = [REAL]; cookieRole = "bod";
    const viewer = await viewerModule.viewerOf(member(["panitia"]));
    expect(viewer.roles).toEqual(["panitia"]);
    expect("demo" in viewer).toBe(false);
  });
});

describe("the sample fills an empty table, only while the demo is on", () => {
  it("sessions: the sample rundown moved to today; never with real sessions; never in Admin's own read", async () => {
    const sessions = await read.allSessions();
    expect(sessions.migrated).toBe(true);
    expect(sessions.data.map(session => session.id)).toContain(sampleSessionIds.pemaparan);
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    expect(sessions.data.some(session => session.startsAt.startsWith(today))).toBe(true);
    expect((await read.allSessionsReal()).data).toEqual([]);

    newRequest();
    sessionRows = [{ id: "real-1", kind: "sesi", status: "terbit", starts_at: "2027-01-04T01:00:00+00:00" }];
    expect((await read.allSessions()).data.map(session => session.id)).toEqual(["real-1"]);
  });

  it("is the old empty answer when the demo is off", async () => {
    demo = false;
    expect((await read.allSessions()).data).toEqual([]);
    expect((await read.listGroups()).data).toEqual([]);
    expect((await read.listTrips()).data).toEqual([]);
    expect((await read.listGuides()).data).toEqual([]);
    expect((await read.awardCategories()).data).toEqual([]);
    expect((await read.attendanceOf({ employeeId: REAL })).data).toEqual([]);
  });

  it("kelompok, perjalanan, panduan, awarding and the person's own check-ins and seats (the asker is the sample's Rani)", async () => {
    expect((await read.listGroups()).data.length).toBeGreaterThan(3);
    expect((await read.listTrips()).data.length).toBeGreaterThan(0);
    expect((await read.listGuides()).data.every(guide => guide.file === null)).toBe(true);
    expect((await read.awardCategories()).data.every(category => category.nomineeKind !== "foto")).toBe(true);
    const mine = (await read.attendanceOf({ employeeId: REAL })).data;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every(row => row.employeeId === REAL)).toBe(true);
    expect((await read.seatsOf(REAL)).data.every(seat => seat.employeeId === REAL)).toBe(true);
    expect((await read.attendanceOf({ sessionId: sampleSessionIds.pemaparan })).data.length).toBeGreaterThan(5);
  });

  it("Admin's lists (guides, awards with all, the log) are what is saved, never the sample", async () => {
    expect((await read.listGuides(true)).data).toEqual([]);
    expect((await read.awardCategories(true)).data).toEqual([]);
    expect((await read.rundownLogReal()).data).toEqual([]);
    expect((await read.listGroupsReal()).data).toEqual([]);
  });
});

describe("a role the account is not reads the sample, never the real data of that role", () => {
  const drawn = (roles: MainWamViewer["roles"]) => ({ demo: { canSwitch: true, role: "panitia" as const, simulated: true, realRoles: roles } });

  it("Moderasi and Pengumuman: a penguji drawn as panitia without being panitia sees sample cards and not one real query", async () => {
    const data = await moderation.moderationData(new Date(), drawn([]));
    expect(data.reported.length).toBeGreaterThan(0);
    expect(fake.queries.some(query => query.table === "mw_photo_reports" || query.table === "mw_photos")).toBe(false);
    expect((await moderation.waitingCount(drawn([]))) > 0).toBe(true);

    const sent = await announce.listSent(drawn([]));
    expect(sent.sent.length).toBeGreaterThan(0);
    expect(fake.queries.some(query => query.table === "pw_announcements")).toBe(false);
  });

  it("a real panitia (or an admin) drawn as panitia reads the real queue, with the sample only while it is empty", async () => {
    await moderation.moderationData(new Date(), drawn(["panitia"]));
    expect(fake.queries.some(query => query.table === "mw_photo_reports")).toBe(true);
    expect(callsOf(fake.queries.find(query => query.table === "mw_photo_reports")!, "select").length).toBeGreaterThan(0);
  });

  it("with the demo off, Moderasi is the real queue and nothing else", async () => {
    demo = false;
    const data = await moderation.moderationData(new Date());
    expect(data.reported).toEqual([]);
    expect(data.hidden).toEqual([]);
  });
});

describe("the sample's people can be looked up, only in the demo", () => {
  it("adds the made-up people next to the real ones (a real person is never replaced)", async () => {
    const { mainWamPeople } = await import("./people");
    const people = await mainWamPeople();
    expect(people.get(REAL)?.name).toBe("Budi");
    expect(people.get(samplePeople.rani.id)?.name).toBe("Rani");
    newRequest();
    demo = false;
    expect((await mainWamPeople()).has(samplePeople.rani.id)).toBe(false);
  });
});

export type { MainWamSettings };
