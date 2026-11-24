import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleMissions } from "@/lib/main-wam/misi/sample";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamViewer } from "@/lib/main-wam/types";

/*
 * What Beranda's card, the Misi page and the Peringkat read, without a database: the person's points
 * are the ledger's sum, the place is among everyone of the event (BOD not counted), a session mission
 * credited from absen is credited once, the Peringkat is closed when Admin closes it, and the sample
 * stands in only while there is no mission at all and Mode demo is on.
 */

const ME = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  errors: {} as Record<string, { code?: string; message?: string }>,
  upserts: [] as { table: string; rows: unknown }[],
  demo: false,
}));

function chain(table: string) {
  const ops: [string, unknown[]][] = [];
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
          const upsert = ops.find(([name]) => name === "upsert");
          if (upsert) state.upserts.push({ table, rows: upsert[1][0] });
          const rows = upsert ? ((upsert[1][0] as Record<string, unknown>[]).map((row, index) => ({ id: `new${index}`, ...row }))) : state.rows[table] ?? [];
          const single = ops.some(([name]) => name === "maybeSingle" || name === "single");
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: state.errors[table] ?? null }).then(resolve, reject);
        };
      }
      return (...args: unknown[]) => { ops.push([String(prop), args]); return proxy; };
    },
  });
  return proxy;
}
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: chain }) }));
vi.mock("../../config", async () => ({ ...(await vi.importActual<typeof import("../../config")>("../../config")), isSupabaseConfigured: () => true }));
vi.mock("../demo", () => ({ demoOn: async () => state.demo }));
vi.mock("../read", () => ({ allSessions: async () => ({ data: [{ id: "s1", title: "Team building" }], migrated: true }) }));
vi.mock("../people", () => ({
  mainWamAttendees: async () => [ME, "a", "b", "c"],
  mainWamPeople: async () => new Map((([[ME, "Rani", "CoE"], ["a", "Ayu", "Finance"], ["b", "Bima", "Sales & Marketing"], ["c", "Citra", "IT"]]) as [string, string, string][])
    .map(([id, name, department]) => [id, { id, name, fullName: `${name} Contoh`, department, photo: null, active: true }] as const)),
}));

const { loadLeaderboard, loadMisi } = await import("./read");

const viewer: MainWamViewer = { id: ME, name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles: [], tester: false, group: null, room: null };
const context = { viewer, settings: defaultSettings() };
const NOW = new Date("2027-01-05T10:00:00+07:00");
const mission = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Misi ${id}`, description: "", kind: "foto", points: 20, place_name: "", latitude: null, longitude: null, radius_m: null, session_id: null, credit: "panitia", review: false, opens_at: null, closes_at: null, sort: 1, active: true, ...extra });

beforeEach(() => {
  state.rows = {
    mw_mission_settings: [{ default_radius_m: 50, max_accuracy_m: 100, leaderboard_open: true }],
    mw_missions: [mission("m1", { points: 20, sort: 1 }), mission("m2", { points: 50, sort: 2, kind: "sesi", session_id: "s1", credit: "absen" })],
    mw_mission_completions: [],
    mw_attendance: [],
    mw_point_totals: [{ employee_id: ME, points: 70, missions: 2 }, { employee_id: "a", points: 120, missions: 3 }, { employee_id: "b", points: 70, missions: 1 }],
  };
  state.errors = {};
  state.upserts = [];
  state.demo = false;
});

describe("loadMisi", () => {
  it("reads the missions with the person's state, their points from the ledger and their place among the event's people", async () => {
    state.rows.mw_mission_completions = [{ id: "c1", mission_id: "m1", employee_id: ME, source: "foto", status: "disetujui" }];
    const data = await loadMisi(context, NOW);
    expect(data).toMatchObject({ migrated: true, sample: false, points: 70, leaderboardOpen: true });
    expect(data.items.map(item => [item.id, item.status])).toEqual([["m1", "done"], ["m2", "todo"]]);
    // a 120; ME and b share 70 (second place, listed by missions); c has nothing (fourth: the place after a tie is skipped).
    expect(data.place).toEqual({ rank: 2, of: 4 });
    expect(data.summary).toMatchObject({ total: 2, done: 1, earnedPoints: 20, availablePoints: 50 });
  });

  it("keeps the person's place back while the Peringkat is closed", async () => {
    state.rows.mw_mission_settings = [{ default_radius_m: 50, max_accuracy_m: 100, leaderboard_open: false }];
    const data = await loadMisi(context, NOW);
    expect(data).toMatchObject({ leaderboardOpen: false, place: null });
  });

  it("credits a session mission from absen, once, and does nothing for one already credited or not attended", async () => {
    state.rows.mw_attendance = [{ session_id: "s1" }];
    const data = await loadMisi(context, NOW);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].table).toBe("mw_mission_completions");
    expect(state.upserts[0].rows).toEqual([{ mission_id: "m2", employee_id: ME, source: "absen", status: "disetujui" }]);
    expect(data.items.find(item => item.id === "m2")?.status).toBe("done");

    state.upserts = [];
    state.rows.mw_attendance = [];
    await loadMisi(context, NOW);
    expect(state.upserts).toEqual([]);
    state.rows.mw_attendance = [{ session_id: "s1" }];
    state.rows.mw_mission_completions = [{ id: "c2", mission_id: "m2", employee_id: ME, source: "panitia", status: "disetujui" }];
    await loadMisi(context, NOW);
    expect(state.upserts).toEqual([]);
  });

  it("leaves a mission that is off out of what a person sees", async () => {
    state.rows.mw_missions = [mission("m1"), mission("m3", { active: false })];
    expect((await loadMisi(context, NOW)).items.map(item => item.id)).toEqual(["m1"]);
  });

  it("is quiet before the migration: empty, not migrated, no error", async () => {
    state.errors.mw_missions = { code: "42P01", message: 'relation "public.mw_missions" does not exist' };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const data = await loadMisi(context, NOW);
    warn.mockRestore();
    expect(data).toMatchObject({ migrated: false, items: [], points: 0, place: null });
  });

  it("shows the sample only while there is no mission at all and Mode demo is on", async () => {
    state.rows.mw_missions = [];
    expect(await loadMisi(context, NOW)).toMatchObject({ migrated: true, sample: false, items: [] });
    state.demo = true;
    const demo = await loadMisi(context, NOW);
    expect(demo.sample).toBe(true);
    expect(demo.items).toHaveLength(sampleMissions.length);
    expect(demo.items.filter(item => item.status === "done")).toHaveLength(2);
    expect(demo.place).toEqual({ rank: 7, of: 118 });
    expect(demo.points).toBe(3400);
    // Real missions put the sample away, demo or not.
    state.rows.mw_missions = [mission("m1")];
    expect((await loadMisi(context, NOW)).sample).toBe(false);
  });

  it("does not carry any coordinates to the page", async () => {
    state.rows.mw_missions = [mission("m1", { kind: "checkin", latitude: -7.8707, longitude: 112.5283, place_name: "Taman Kota" })];
    const text = JSON.stringify(await loadMisi(context, NOW));
    expect(text).toContain("Taman Kota");
    expect(text).not.toContain("112.5283");
    expect(text).not.toContain("-7.8707");
  });
});

describe("loadLeaderboard", () => {
  it("ranks the event's people without ids, the asker marked", async () => {
    const board = await loadLeaderboard(context);
    expect(board).toMatchObject({ migrated: true, open: true });
    expect(board.rows.map(row => [row.rank, row.name, row.points, row.me])).toEqual([[1, "Ayu", 120, false], [2, "Rani", 70, true], [2, "Bima", 70, false], [4, "Citra", 0, false]]);
    expect(board.rows[2].department).toBe("SM");
    expect(JSON.stringify(board)).not.toContain(ME);
  });

  it("gives nothing while Admin has it closed", async () => {
    state.rows.mw_mission_settings = [{ default_radius_m: 50, max_accuracy_m: 100, leaderboard_open: false }];
    expect(await loadLeaderboard(context)).toEqual({ migrated: true, open: false, rows: [] });
  });

  it("is the sample board in Mode demo with no mission yet", async () => {
    state.rows.mw_missions = [];
    state.demo = true;
    const board = await loadLeaderboard(context);
    expect(board.rows).toHaveLength(118);
    expect(board.rows.find(row => row.me)).toMatchObject({ rank: 7, points: 3400, name: "Rani" });
  });
});
