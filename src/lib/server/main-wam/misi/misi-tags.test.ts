import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import type { MainWamViewer } from "@/lib/main-wam/types";

/*
 * Tagging friends on a mission photo without a database: only active participants can be tagged (never the
 * person, never someone without a WAM account), suggestions come from HR's rooms and the train's seats, the
 * tagged person is told once and can lift their own tag (only theirs).
 */

const ME = "11111111-1111-4111-8111-111111111111";
const SARI = "22222222-2222-4222-8222-222222222222";
const BIMA = "33333333-3333-4333-8333-333333333333";
const WULAN = "44444444-4444-4444-8444-444444444444";
const GONE = "55555555-5555-4555-8555-555555555555";
const OUTSIDER = "66666666-6666-4666-8666-666666666666";
const PHOTO = "77777777-7777-4777-8777-777777777777";
const TRAIN = "88888888-8888-4888-8888-888888888888";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  updated: 0,
  calls: [] as { table: string; ops: [string, unknown[]][] }[],
  notes: [] as Record<string, unknown>[],
  pending: [] as Promise<unknown>[],
}));

function chain(table: string) {
  const call = { table, ops: [] as [string, unknown[]][] };
  state.calls.push(call);
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
          const names = call.ops.map(([name]) => name);
          if (names.includes("update")) return Promise.resolve({ data: Array.from({ length: state.updated }, () => ({ photo_id: PHOTO })), error: null }).then(resolve, reject);
          const single = names.includes("maybeSingle") || names.includes("single");
          const rows = state.rows[table] ?? [];
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
        };
      }
      return (...args: unknown[]) => { call.ops.push([String(prop), args]); return proxy; };
    },
  });
  return proxy;
}
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: chain }) }));
vi.mock("next/server", () => ({ after: (work: () => Promise<unknown>) => { state.pending.push(work()); } }));
vi.mock("../notes", () => ({ trySendMainWamNote: async (input: Record<string, unknown>) => { state.notes.push(input); return 1; } }));
vi.mock("../people", () => ({
  mainWamEventPeople: async () => ({ accounts: [ME, SARI, BIMA, WULAN, GONE], bod: new Set([WULAN]), panitia: new Set() }),
  mainWamPeople: async () => new Map([
    [ME, { id: ME, name: "Rani", fullName: "Rani Contoh", department: "CoE", active: true }], [SARI, { id: SARI, name: "Sari", fullName: "Sari Contoh", department: "HRGA", active: true }],
    [BIMA, { id: BIMA, name: "Bima", fullName: "Bima Contoh", department: "Finance", active: true }], [WULAN, { id: WULAN, name: "Wulan", fullName: "Wulan Contoh", department: "BOD", active: true }],
    [GONE, { id: GONE, name: "Lama", fullName: "Lama Contoh", department: "CoE", active: false }],
  ]),
}));
vi.mock("../viewer", () => ({ viewerRoom: async () => ({ id: "r", name: "208", kind: "", floor: "", note: "", people: [{ id: ME, name: "Rani", department: "CoE", me: true }, { id: SARI, name: "Sari", department: "HRGA", me: false }] }) }));
vi.mock("../read", () => ({
  seatsOf: async () => ({ data: [{ tripId: TRAIN, employeeId: ME, seat: "Gerbong 3 · Kursi 12A", vehicle: "" }], migrated: true }),
  listTrips: async () => ({ data: [{ id: TRAIN, kind: "kereta" }, { id: "bus", kind: "bus" }], migrated: true }),
}));

const tags = await import("./tags");
const refused = async (promise: Promise<unknown>) => promise.then(() => null, (error: { status: number; message: string }) => ({ status: error.status, message: error.message }));
const viewer = { id: ME, name: "Rani" } as MainWamViewer;
const writes = () => state.calls.flatMap(call => call.ops.filter(([name]) => ["insert", "update", "upsert"].includes(name)).map(([name, args]) => ({ table: call.table, name, row: args[0], options: args[1] })));

beforeEach(() => {
  state.rows = { mw_trip_seats: [{ trip_id: TRAIN, employee_id: BIMA, seat: "Gerbong 3 · Kursi 12B" }, { trip_id: TRAIN, employee_id: WULAN, seat: "Gerbong 3 · Kursi 14A" }] };
  state.updated = 1; state.calls = []; state.notes = []; state.pending = [];
});

describe("who can be tagged", () => {
  it("lists active participants with what the rules need: BOD, the person next to me on the train, my roommate; never me or someone who left", async () => {
    const pool = await tags.loadTagPool({ viewer });
    expect([...pool.keys()].sort()).toEqual([SARI, BIMA, WULAN].sort());
    expect(pool.get(SARI)).toMatchObject({ roommate: true, seatmate: false, bod: false, department: "HRGA" });
    expect(pool.get(BIMA)).toMatchObject({ seatmate: true, roommate: false });
    expect(pool.get(WULAN)).toMatchObject({ bod: true, seatmate: false });
    expect(pool.has(ME)).toBe(false);
    expect(pool.has(GONE)).toBe(false);
  });

  it("looks the seats up only on a train step of mine", async () => {
    await tags.loadTagPool({ viewer });
    const seatRead = state.calls.find(call => call.table === "mw_trip_seats")!;
    expect(seatRead.ops).toContainEqual(["in", ["trip_id", [TRAIN]]]);
  });

  it("refuses someone who is not an active participant, and keeps each person once", async () => {
    const pool = await tags.loadTagPool({ viewer });
    expect(await refused(Promise.resolve().then(() => tags.resolveTags(pool, [SARI, OUTSIDER])))).toEqual({ status: 422, message: "Orang yang ditandai harus peserta acara yang aktif." });
    expect(await refused(Promise.resolve().then(() => tags.resolveTags(pool, [ME])))).toMatchObject({ status: 422 });
    expect(tags.resolveTags(pool, [SARI, SARI.toUpperCase(), WULAN]).map(person => person.id)).toEqual([SARI, WULAN]);
    expect(tags.resolveTags(pool, [])).toEqual([]);
  });
});

describe("keeping, telling and lifting tags", () => {
  const sari: TagCandidate = { id: SARI, name: "Sari", department: "HRGA", bod: false, seatmate: false, roommate: true };

  it("keeps the tags once: a person already tagged, or who lifted theirs, is left as it is", async () => {
    await tags.savePhotoTags(PHOTO, ME, [sari]);
    expect(writes()).toEqual([{ table: "mw_photo_tags", name: "upsert", row: [{ photo_id: PHOTO, employee_id: SARI, tagged_by: ME }], options: { onConflict: "photo_id,employee_id", ignoreDuplicates: true } }]);
    state.calls = [];
    await tags.savePhotoTags(PHOTO, ME, []);
    expect(writes()).toEqual([]);
  });

  it("tells the people still tagged: 'Kamu ditandai di foto misi <judul>', through the bell, to them only", async () => {
    state.rows.mw_photo_tags = [{ employee_id: SARI }, { employee_id: BIMA }];
    await tags.notifyTagged(PHOTO, "Rani", "Foto bareng KEDUA BOD");
    await Promise.all(state.pending);
    expect(state.notes).toEqual([expect.objectContaining({ title: "Kamu ditandai di foto misi Foto bareng KEDUA BOD", to: { people: [SARI, BIMA], label: "Orang yang ditandai" }, by: null })]);
    expect(state.notes[0].body).toContain("Rani menandaimu");
    const read = state.calls.find(call => call.table === "mw_photo_tags")!;
    expect(read.ops).toContainEqual(["is", ["removed_at", null]]);
  });

  it("tells nobody when nobody is tagged", async () => {
    state.rows.mw_photo_tags = [];
    await tags.notifyTagged(PHOTO, "Rani", "Foto");
    await Promise.all(state.pending);
    expect(state.notes).toEqual([]);
  });

  it("lets a person lift only their own tag, once", async () => {
    await tags.removeMyTag({ viewer: { ...viewer, id: SARI } as MainWamViewer }, PHOTO);
    const write = writes()[0];
    expect(write).toMatchObject({ table: "mw_photo_tags", name: "update", row: { removed_at: expect.any(String) } });
    const call = state.calls.find(item => item.ops.some(([name]) => name === "update"))!;
    expect(call.ops).toContainEqual(["eq", ["employee_id", SARI]]);
    expect(call.ops).toContainEqual(["eq", ["photo_id", PHOTO]]);
    expect(call.ops).toContainEqual(["is", ["removed_at", null]]);
    state.updated = 0;
    expect(await refused(tags.removeMyTag({ viewer }, PHOTO))).toEqual({ status: 404, message: "Tag tidak ditemukan." });
  });
});

describe("for Momen and the Misi page", () => {
  it("gives Momen the names tagged on each photo, tags still on only", async () => {
    state.rows.mw_photo_tags = [{ photo_id: PHOTO, employee_id: SARI }, { photo_id: PHOTO, employee_id: BIMA }];
    const map = await tags.tagsOfPhotos([PHOTO, "bukan-id", PHOTO]);
    expect(map.get(PHOTO)).toEqual([{ id: SARI, name: "Sari" }, { id: BIMA, name: "Bima" }]);
    expect([...map.keys()]).toEqual([PHOTO]);
    const read = state.calls.find(call => call.table === "mw_photo_tags")!;
    expect(read.ops).toContainEqual(["is", ["removed_at", null]]);
    state.calls = [];
    expect((await tags.tagsOfPhotos([])).size).toBe(0);
    expect(state.calls).toEqual([]);
  });

  it("lists the photos I am tagged in, with who tagged me and the mission, only those shown", async () => {
    state.rows.mw_photo_tags = [{ photo_id: PHOTO, tagged_by: SARI }];
    state.rows.mw_photos = [{ id: PHOTO, mission_id: "m1" }];
    state.rows.mw_missions = [{ id: "m1", title: "Selfie dengan teman sekamar" }];
    expect(await tags.taggedInOf(ME)).toEqual([{ photoId: PHOTO, byName: "Sari", missionTitle: "Selfie dengan teman sekamar" }]);
    const photos = state.calls.find(call => call.table === "mw_photos")!;
    expect(photos.ops).toContainEqual(["eq", ["status", "tampil"]]);
  });
});
