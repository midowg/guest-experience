import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Admin WAM → Misi's writers without a database: a mission with completions is not deleted (its
 * people's points would go with it), a decision on a proof records who and why, points by hand are a
 * ledger row with a reason and the admin's name, and the Peringkat shown to an admin names everyone in full.
 */

const ADMIN = "99999999-9999-4999-8999-999999999999";
const ID = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  count: 0,
  error: null as { code?: string; message?: string } | null,
  calls: [] as { table: string; ops: [string, unknown[]][] }[],
}));

function chain(table: string) {
  const call = { table, ops: [] as [string, unknown[]][] };
  state.calls.push(call);
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
          const single = call.ops.some(([name]) => name === "maybeSingle" || name === "single");
          const rows = state.rows[table] ?? [];
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: state.error, count: state.count }).then(resolve, reject);
        };
      }
      return (...args: unknown[]) => { call.ops.push([String(prop), args]); return proxy; };
    },
  });
  return proxy;
}
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: chain }) }));
vi.mock("../admin/common", async () => {
  const { ServiceError } = await import("../../config");
  return {
    adminActor: async () => ({ employeeId: ADMIN, name: "Admin" }),
    adminFail: (error: { code?: string; message?: string }) => { throw new ServiceError(error.code === "23505" ? 409 : 503, error.message ?? "gagal"); },
    adminPeople: async () => [{ id: PERSON, fullName: "Rani Contoh", name: "Rani", department: "CoE" }],
  };
});
vi.mock("./read", () => ({
  allMissions: async () => ({ data: [{ id: ID, title: "Foto apel", kind: "foto", points: 40, placeName: "", latitude: null, longitude: null, radiusM: null, sessionId: null, credit: "panitia", review: true, opensAt: null, closesAt: null, sort: 1, active: true, description: "" }], migrated: true }),
  missionSettings: async () => ({ defaultRadiusM: 50, maxAccuracyM: 100, leaderboardOpen: true }),
  pointTotals: async () => ({ data: new Map([[PERSON, { points: 70, missions: 2 }], ["b", { points: 70, missions: 1 }]]), migrated: true }),
}));
vi.mock("../read", () => ({ allSessionsReal: async () => ({ data: [{ id: "s1", title: "Team building", startsAt: "2027-01-05T15:00:00+07:00", status: "terbit" }, { id: "s2", title: "Batal", startsAt: "2027-01-05T16:00:00+07:00", status: "batal" }], migrated: true }) }));
vi.mock("../people", () => ({
  mainWamAttendees: async () => [PERSON, "b"],
  mainWamPeople: async () => new Map([[PERSON, { id: PERSON, name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, active: true }], ["b", { id: "b", name: "Bima", fullName: "Bima Contoh", department: "Finance", photo: null, active: true }]]),
}));
vi.mock("../../r2", () => ({ isR2Configured: () => true, presignDownload: async (key: string) => `https://storage.test/${key}`, removeObjects: async () => undefined, presignUpload: async () => "", uploadedStart: async () => new Uint8Array(), copyObject: async () => undefined }));
vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => "s".repeat(40) }));

const admin = await import("./admin");
const refused = async (promise: Promise<unknown>) => promise.then(() => null, (error: { status: number; message: string }) => ({ status: error.status, message: error.message }));
const writes = () => state.calls.flatMap(call => call.ops.filter(([name]) => ["insert", "update", "delete", "upsert"].includes(name)).map(([name, args]) => ({ table: call.table, name, row: args[0] as Record<string, unknown> })));

beforeEach(() => {
  state.rows = { mw_missions: [{ id: ID, title: "Foto apel", kind: "foto", points: 40, place_name: "", description: "", credit: "panitia", review: true, sort: 1, active: true }], mw_mission_completions: [], mw_point_entries: [] };
  state.count = 0;
  state.error = null;
  state.calls = [];
});

describe("Admin WAM → Misi", () => {
  it("does not delete a mission that people have done: it is turned off instead", async () => {
    state.count = 3;
    expect(await refused(admin.deleteMission(ID))).toEqual({ status: 409, message: expect.stringContaining("Matikan saja") });
    expect(writes()).toEqual([]);
    state.count = 0;
    await admin.deleteMission(ID);
    expect(writes()).toEqual([{ table: "mw_missions", name: "delete", row: undefined }]);
  });

  it("records who decided a proof, when and why, and takes the mission's own status words", async () => {
    state.rows.mw_mission_completions = [{ id: ID }];
    await admin.reviewCompletion(ID, { status: "ditolak", note: "Bukan di tugu" });
    expect(writes()[0]).toMatchObject({ table: "mw_mission_completions", name: "update", row: { status: "ditolak", review_note: "Bukan di tugu", reviewed_by: ADMIN, reviewed_at: expect.any(String) } });
  });

  it("says a completion that is gone is gone", async () => {
    state.rows.mw_mission_completions = [];
    expect(await refused(admin.reviewCompletion(ID, { status: "disetujui", note: "" }))).toEqual({ status: 404, message: expect.stringContaining("tidak ditemukan") });
  });

  it("records a person as having done a mission (panitia's hand), once", async () => {
    await admin.grantCompletion(ID, PERSON, "Bercerita di sesi");
    expect(writes()[0]).toMatchObject({ table: "mw_mission_completions", name: "insert", row: { mission_id: ID, employee_id: PERSON, source: "panitia", status: "disetujui", note: "Bercerita di sesi", reviewed_by: ADMIN } });
    state.calls = [];
    state.rows.mw_mission_completions = [{ id: "c1", status: "disetujui" }];
    expect(await refused(admin.grantCompletion(ID, PERSON, ""))).toEqual({ status: 409, message: "Orang ini sudah punya poin dari misi tersebut." });
    expect(writes()).toEqual([]);
    // One that was turned down or waiting is made approved by updating that row, not by a second row.
    state.rows.mw_mission_completions = [{ id: "c1", status: "ditolak" }];
    await admin.grantCompletion(ID, PERSON, "");
    expect(writes()[0]).toMatchObject({ name: "update", row: { status: "disetujui", source: "panitia" } });
  });

  it("writes points by hand as a ledger row with the reason and the admin", async () => {
    await admin.addManualPoints(PERSON, -10, "Koreksi salah hitung");
    expect(writes()).toEqual([{ table: "mw_point_entries", name: "insert", row: { employee_id: PERSON, points: -10, kind: "manual", note: "Koreksi salah hitung", created_by: ADMIN } }]);
  });

  it("removes only manual entries (a mission's points go with its completion)", async () => {
    state.rows.mw_point_entries = [{ id: ID }];
    await admin.deleteManualEntry(ID);
    const call = state.calls.find(item => item.ops.some(([name]) => name === "delete"))!;
    expect(call.ops).toContainEqual(["eq", ["kind", "manual"]]);
    state.rows.mw_point_entries = [];
    expect((await refused(admin.deleteManualEntry(ID)))?.status).toBe(404);
  });

  it("shows the whole page of an admin: missions with counts, the Peringkat in full names, sessions that are not cancelled", async () => {
    state.rows.mw_mission_completions = [
      { id: "c1", mission_id: ID, employee_id: PERSON, source: "foto", status: "menunggu", proof_key: "main-wam/misi/x.jpg", created_at: "2027-01-05T09:00:00+07:00" },
      { id: "c2", mission_id: ID, employee_id: "b", source: "foto", status: "disetujui", proof_key: null, created_at: "2027-01-05T08:00:00+07:00" },
    ];
    const data = await admin.adminMisi();
    expect(data.migrated).toBe(true);
    expect(data.missions[0]).toMatchObject({ id: ID, done: 1, pending: 1, rejected: 0 });
    expect(data.completions[0]).toMatchObject({ id: "c1", status: "menunggu", person: "Rani Contoh", missionTitle: "Foto apel", hasProof: true });
    expect(data.leaderboard.map(row => [row.rank, row.fullName])).toEqual([[1, "Rani Contoh"], [1, "Bima Contoh"]]);
    expect(data.sessions.map(session => session.id)).toEqual(["s1"]);
  });

  it("gives a proof's address only for a completion that has one", async () => {
    state.rows.mw_mission_completions = [{ proof_key: "main-wam/misi/x.jpg" }];
    expect(await admin.proofRedirect(ID)).toBe("https://storage.test/main-wam/misi/x.jpg");
    state.rows.mw_mission_completions = [{ proof_key: null }];
    expect(await admin.proofRedirect(ID)).toBeNull();
    expect(await admin.proofRedirect("bukan-id")).toBeNull();
  });
});
