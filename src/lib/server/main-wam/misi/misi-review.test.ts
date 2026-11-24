import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The review of mission photos without a database: the queue (what a reviewer needs on one screen), and
 * the decision: only a move the road allows, the points follow the status (the database's trigger), an
 * approval shows the Momen photo and tells the tagged, a rejection removes the photo and tells the person why.
 */

const ID = "11111111-1111-4111-8111-111111111111";
const MISSION = "22222222-2222-4222-8222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";
const FRIEND = "44444444-4444-4444-8444-444444444444";
const PHOTO = "55555555-5555-4555-8555-555555555555";
const REVIEWER = "66666666-6666-4666-8666-666666666666";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  raced: false,
  calls: [] as { table: string; ops: [string, unknown[]][] }[],
  notes: [] as Record<string, unknown>[],
  published: [] as string[],
  withdrawn: [] as string[],
  tagged: [] as unknown[][],
}));

function chain(table: string) {
  const call = { table, ops: [] as [string, unknown[]][] };
  state.calls.push(call);
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
          const names = call.ops.map(([name]) => name);
          const single = names.includes("maybeSingle") || names.includes("single");
          const rows = state.rows[table] ?? [];
          // A decision that lost a race updates nothing.
          if (names.includes("update") && state.raced && table === "mw_mission_completions" && names.includes("select")) return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          if (names.includes("update") && names.includes("select")) return Promise.resolve({ data: { id: ID }, error: null }).then(resolve, reject);
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
        };
      }
      return (...args: unknown[]) => { call.ops.push([String(prop), args]); return proxy; };
    },
  });
  return proxy;
}
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: chain }) }));
vi.mock("./read", () => ({
  allMissions: async () => ({ data: [{ id: MISSION, title: "Foto bareng KEDUA BOD", points: 150, kind: "foto", description: "", placeName: "", latitude: null, longitude: null, radiusM: null, opensAt: null, closesAt: null, rules: [{ type: "foto_langsung" }, { type: "tag", count: 2, relation: "bod", required: true }, { type: "batas_kali", times: 3 }] }], migrated: true }),
  missionSettings: async () => ({ defaultRadiusM: 50 }),
}));
vi.mock("../people", () => ({ mainWamPeople: async () => new Map([[PERSON, { id: PERSON, name: "Rani", fullName: "Rani Contoh", department: "CoE" }], [FRIEND, { id: FRIEND, name: "Wulan", fullName: "Wulan Contoh", department: "BOD" }]]) }));
vi.mock("../notes", () => ({ trySendMainWamNote: async (input: Record<string, unknown>) => { state.notes.push(input); return 1; } }));
vi.mock("../momen/mission-photo", () => ({ publishMissionPhoto: async (id: string) => { state.published.push(id); }, withdrawMissionPhoto: async (id: string) => { state.withdrawn.push(id); } }));
vi.mock("./tags", () => ({ notifyTagged: async (...args: unknown[]) => { state.tagged.push(args); } }));

const { decideReview, listReviewQueue } = await import("./review");
const refused = async (promise: Promise<unknown>) => promise.then(() => null, (error: { status: number; message: string }) => ({ status: error.status, message: error.message }));
const writes = () => state.calls.flatMap(call => call.ops.filter(([name]) => ["insert", "update", "delete"].includes(name)).map(([name, args]) => ({ table: call.table, name, row: args[0] as Record<string, unknown> })));
const completion = (over: Record<string, unknown> = {}) => ({
  id: ID, mission_id: MISSION, employee_id: PERSON, source: "foto", status: "perlu_ditinjau", proof_key: "main-wam/misi/x.jpg", attempts: 1, photo_id: PHOTO, created_at: "2027-01-05T09:12:00+07:00",
  check_result: { checks: [{ type: "tag", ok: true, reason: "" }, { type: "foto_langsung", ok: true, reason: "" }], verifier: { provider: "manual", result: { putusan: "ragu", alasan: ["Menunggu tinjauan panitia."] } }, decidedAt: "2027-01-05T09:12:30+07:00" }, ...over,
});

beforeEach(() => {
  state.rows = { mw_mission_completions: [completion()], mw_photo_tags: [{ photo_id: PHOTO, employee_id: FRIEND }] };
  state.raced = false; state.calls = []; state.notes = []; state.published = []; state.withdrawn = []; state.tagged = [];
});

describe("the review queue", () => {
  it("lists what a reviewer needs on one screen: who, the photo, the TNC, what the checks found, the tags and the verifier", async () => {
    const queue = await listReviewQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: ID, missionTitle: "Foto bareng KEDUA BOD", points: 150, person: "Rani Contoh", department: "CoE", status: "perlu_ditinjau", attempts: 1, maxAttempts: 3,
      photo: `/api/admin/wam2026/misi/penyelesaian/${ID}/foto`, tags: [{ id: FRIEND, name: "Wulan Contoh", department: "BOD" }],
      verifier: { provider: "manual", result: { putusan: "ragu" } },
    });
    expect(queue[0].rules.map(rule => rule.type)).toEqual(["foto_langsung", "tag", "batas_kali"]);
    expect(queue[0].rules[1].text).toBe("Tandai 2 anggota BOD");
    expect(queue[0].checks).toHaveLength(2);
  });

  it("asks only for the proofs a person must decide, oldest first", async () => {
    await listReviewQueue();
    const read = state.calls.find(call => call.table === "mw_mission_completions")!;
    expect(read.ops).toContainEqual(["in", ["status", ["perlu_ditinjau", "menunggu"]]]);
    expect(read.ops).toContainEqual(["order", ["created_at"]]);
  });

  it("is empty when nothing waits, without reading the tags", async () => {
    state.rows.mw_mission_completions = [];
    expect(await listReviewQueue()).toEqual([]);
    expect(state.calls.some(call => call.table === "mw_photo_tags")).toBe(false);
  });
});

describe("a decision", () => {
  it("approves: records who and when, shows the Momen photo, tells the tagged and the person", async () => {
    expect(await decideReview(ID, REVIEWER, { status: "disetujui", note: "" })).toEqual({ status: "disetujui" });
    expect(writes()[0]).toMatchObject({ table: "mw_mission_completions", name: "update", row: { status: "disetujui", review_note: "", reviewed_by: REVIEWER, reviewed_at: expect.any(String) } });
    const update = state.calls.find(call => call.ops.some(([name]) => name === "update"))!;
    expect(update.ops).toContainEqual(["eq", ["status", "perlu_ditinjau"]]);
    expect(state.published).toEqual([PHOTO]);
    expect(state.tagged).toEqual([[PHOTO, "Rani", "Foto bareng KEDUA BOD"]]);
    expect(state.notes).toEqual([expect.objectContaining({ title: "Misi Foto bareng KEDUA BOD disetujui", body: "150 poin masuk.", to: { people: [PERSON], label: "Peserta misi" } })]);
  });

  it("rejects: the reason is kept and told, the Momen photo goes and the link is cleared", async () => {
    await decideReview(ID, REVIEWER, { status: "ditolak", note: "Hanya satu BOD." });
    expect(writes()[0]).toMatchObject({ name: "update", row: { status: "ditolak", review_note: "Hanya satu BOD.", reviewed_by: REVIEWER } });
    expect(writes()[1]).toMatchObject({ name: "update", row: { photo_id: null } });
    expect(state.withdrawn).toEqual([PHOTO]);
    expect(state.published).toEqual([]);
    expect(state.tagged).toEqual([]);
    expect(state.notes[0]).toMatchObject({ title: "Misi Foto bareng KEDUA BOD ditolak", body: "Hanya satu BOD." });
  });

  it("takes an approved one back (the points go with the status)", async () => {
    state.rows.mw_mission_completions = [completion({ status: "disetujui" })];
    await decideReview(ID, null, { status: "ditolak", note: "Salah orang." });
    expect(writes()[0]).toMatchObject({ row: { status: "ditolak" } });
  });

  it("refuses what the road does not allow, an id that is not one, and a proof that is gone", async () => {
    state.rows.mw_mission_completions = [completion({ status: "disetujui" })];
    expect(await refused(decideReview(ID, REVIEWER, { status: "disetujui", note: "" }))).toEqual({ status: 409, message: "Kiriman ini sudah diputuskan." });
    expect((await refused(decideReview("bukan-id", REVIEWER, { status: "disetujui", note: "" })))?.status).toBe(404);
    state.rows.mw_mission_completions = [];
    expect((await refused(decideReview(ID, REVIEWER, { status: "disetujui", note: "" })))?.status).toBe(404);
    expect(writes()).toEqual([]);
  });

  it("says so when someone else decided meanwhile, and changes nothing else", async () => {
    state.raced = true;
    expect(await refused(decideReview(ID, REVIEWER, { status: "disetujui", note: "" }))).toEqual({ status: 409, message: expect.stringContaining("sudah diputuskan orang lain") });
    expect(state.published).toEqual([]);
    expect(state.notes).toEqual([]);
  });

  it("works for a proof the older way (status menunggu, before the migration's columns)", async () => {
    state.rows.mw_mission_completions = [completion({ status: "menunggu", photo_id: null, check_result: null, attempts: undefined })];
    await decideReview(ID, REVIEWER, { status: "disetujui", note: "" });
    expect(state.published).toEqual([]);
    expect(writes()[0].row).toMatchObject({ status: "disetujui" });
  });
});
