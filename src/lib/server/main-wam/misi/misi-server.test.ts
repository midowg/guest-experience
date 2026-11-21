import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleMissions } from "@/lib/main-wam/misi/sample";
import { DEFAULT_MISSION_SETTINGS, type MwMission } from "@/lib/main-wam/misi/types";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamViewer } from "@/lib/main-wam/types";

/*
 * Doing a mission without a database: the server finds the mission, checks that it is open and not
 * done, judges the position itself (the phone's word is never enough), and keeps the proof; an
 * approved completion is what gives points (the trigger in 202611260001, covered by the SQL test).
 */

vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => "s".repeat(40) }));

const state = vi.hoisted(() => ({
  missions: [] as MwMission[],
  existing: null as Record<string, unknown> | null,
  from: [] as { table: string; ops: [string, unknown[]][] }[],
  insertError: null as { code?: string; message?: string } | null,
  removed: [] as string[][],
  copied: [] as [string, string][],
  uploadedBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]),
}));

function chain(table: string) {
  const call = { table, ops: [] as [string, unknown[]][] };
  state.from.push(call);
  const written = () => call.ops.find(([name]) => name === "insert" || name === "update");
  const answer = () => {
    if (table === "mw_mission_completions" && written()) {
      if (state.insertError) return { data: null, error: state.insertError };
      const row = (written()![1][0] ?? {}) as Record<string, unknown>;
      return { data: { id: "c1", mission_id: row.mission_id ?? "m", employee_id: "e", source: row.source, status: row.status, proof_key: row.proof_key ?? null }, error: null };
    }
    if (table === "mw_mission_completions") return { data: state.existing, error: null };
    return { data: null, error: null };
  };
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(answer()).then(resolve, reject);
      return (...args: unknown[]) => { call.ops.push([String(prop), args]); return proxy; };
    },
  });
  return proxy;
}
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: chain }) }));
vi.mock("./read", () => ({
  allMissions: async () => ({ data: state.missions, migrated: true }),
  missionSettings: async () => ({ ...DEFAULT_MISSION_SETTINGS }),
}));
vi.mock("../modul/rate", () => ({ limitPerson: async () => undefined }));
vi.mock("../../r2", () => ({
  isR2Configured: () => true,
  presignUpload: async (key: string) => `https://storage.test/${key}`,
  presignDownload: async (key: string) => `https://storage.test/${key}?get`,
  uploadedStart: async () => state.uploadedBytes,
  copyObject: async (from: string, to: string) => { state.copied.push([from, to]); },
  removeObjects: async (keys: string[]) => { state.removed.push(keys); },
}));

const { checkIn, checkPosition, confirmPhoto, startPhoto } = await import("./actions");
const { proofIdFor } = await import("./storage");

const NOW = new Date("2027-01-05T10:00:00+07:00");
const ALUN = { latitude: -7.8707, longitude: 112.5283 };
const viewer: MainWamViewer = { id: "22222222-2222-4222-8222-222222222222", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles: [], tester: false, group: null, room: null };
const context = { viewer, settings: defaultSettings() };

const MISSION_ID = "11111111-1111-4111-8111-111111111111";
const mission = (over: Partial<MwMission> = {}): MwMission => ({
  id: MISSION_ID, title: "Jelajah Taman Kota", description: "", kind: "checkin", points: 30, placeName: "Taman Kota", latitude: ALUN.latitude, longitude: ALUN.longitude, radiusM: 50,
  sessionId: null, credit: "panitia", review: false, opensAt: null, closesAt: null, sort: 1, active: true, ...over,
});
const here = (over: Partial<{ latitude: number; longitude: number; accuracy: number; at: string }> = {}) => ({ ...ALUN, accuracy: 12, at: NOW.toISOString(), ...over });
const writes = () => state.from.flatMap(call => call.ops.filter(([name]) => name === "insert" || name === "update").map(([name, args]) => ({ table: call.table, name, row: args[0] as Record<string, unknown> })));
const refused = async (promise: Promise<unknown>) => promise.then(() => null, (error: { status: number; message: string }) => ({ status: error.status, message: error.message }));

beforeEach(() => {
  state.missions = [mission()];
  state.existing = null;
  state.from = [];
  state.insertError = null;
  state.removed = [];
  state.copied = [];
});

describe("check-in", () => {
  it("keeps a check-in inside the circle: approved, with where and how far", async () => {
    const done = await checkIn(context, MISSION_ID, here({ latitude: ALUN.latitude + 0.0001 }), NOW);
    expect(done.status).toBe("disetujui");
    expect(writes()).toEqual([{ table: "mw_mission_completions", name: "insert", row: expect.objectContaining({
      mission_id: MISSION_ID, employee_id: viewer.id, source: "lokasi", status: "disetujui", accuracy_m: 12, proof_key: null, review_note: "",
    }) }]);
    const row = writes()[0].row;
    expect(row.distance_m).toBeGreaterThanOrEqual(10);
    expect(row.distance_m).toBeLessThanOrEqual(12);
  });

  it("refuses a person who is not there, and writes nothing", async () => {
    const answer = await refused(checkIn(context, MISSION_ID, here({ latitude: ALUN.latitude + 0.002 }), NOW));
    expect(answer).toEqual({ status: 422, message: "Kamu belum berada di area misi." });
    expect(writes()).toEqual([]);
  });

  it("refuses a fix that is too coarse, even a close one", async () => {
    expect(await refused(checkIn(context, MISSION_ID, here({ accuracy: 400 }), NOW))).toEqual({ status: 422, message: "Lokasi kurang teliti. Coba di tempat terbuka." });
    expect(writes()).toEqual([]);
  });

  it("uses the mission's own radius, else the default one", async () => {
    const offset = { latitude: ALUN.latitude + 0.0006 }; // about 66 m
    state.missions = [mission({ radiusM: 80 })];
    expect((await checkIn(context, MISSION_ID, here(offset), NOW)).status).toBe("disetujui");
    state.missions = [mission({ radiusM: null })];
    expect((await refused(checkIn(context, MISSION_ID, here(offset), NOW)))?.status).toBe(422);
  });

  it("waits for review when the mission asks for it", async () => {
    state.missions = [mission({ review: true })];
    expect((await checkIn(context, MISSION_ID, here(), NOW)).status).toBe("menunggu");
  });

  it("is done once: a completion that is approved or waiting refuses another", async () => {
    state.existing = { id: "c0", mission_id: MISSION_ID, employee_id: viewer.id, status: "disetujui", source: "lokasi" };
    expect(await refused(checkIn(context, MISSION_ID, here(), NOW))).toEqual({ status: 409, message: "Misi ini sudah selesai." });
    state.existing = { ...state.existing, status: "menunggu" };
    expect(await refused(checkIn(context, MISSION_ID, here(), NOW))).toEqual({ status: 409, message: "Kirimanmu sedang ditinjau." });
    expect(writes()).toEqual([]);
  });

  it("lets a turned-down one be sent again: it updates that row, only while it is still turned down", async () => {
    state.existing = { id: "c0", mission_id: MISSION_ID, employee_id: viewer.id, status: "ditolak", source: "lokasi" };
    expect((await checkIn(context, MISSION_ID, here(), NOW)).status).toBe("disetujui");
    const calls = state.from.filter(call => call.ops.some(([name]) => name === "update"));
    expect(calls).toHaveLength(1);
    expect(calls[0].ops).toContainEqual(["eq", ["id", "c0"]]);
    expect(calls[0].ops).toContainEqual(["eq", ["status", "ditolak"]]);
    expect(writes()[0]).toMatchObject({ name: "update", row: expect.objectContaining({ status: "disetujui", reviewed_by: null, review_note: "" }) });
  });

  it("says done when two taps race and the database keeps one (unique violation)", async () => {
    state.insertError = { code: "23505", message: "duplicate key" };
    expect(await refused(checkIn(context, MISSION_ID, here(), NOW))).toEqual({ status: 409, message: "Misi ini sudah selesai." });
  });

  it("refuses a mission that has not opened, has closed, is off, is unknown, is of another kind, or is a sample", async () => {
    state.missions = [mission({ opensAt: "2027-01-05T11:00:00+07:00" })];
    expect(await refused(checkIn(context, MISSION_ID, here(), NOW))).toEqual({ status: 409, message: "Misi ini belum dibuka." });
    state.missions = [mission({ closesAt: "2027-01-05T09:00:00+07:00" })];
    expect(await refused(checkIn(context, MISSION_ID, here(), NOW))).toEqual({ status: 409, message: "Misi ini sudah ditutup." });
    state.missions = [mission({ active: false })];
    expect(await refused(checkIn(context, MISSION_ID, here(), NOW))).toEqual({ status: 404, message: "Misi tidak ditemukan." });
    state.missions = [];
    expect(await refused(checkIn(context, MISSION_ID, here(), NOW))).toEqual({ status: 404, message: "Misi tidak ditemukan." });
    state.missions = [mission({ kind: "foto" })];
    expect(await refused(checkIn(context, MISSION_ID, here(), NOW))).toEqual({ status: 409, message: "Misi ini dikerjakan dengan cara lain." });
    expect((await refused(checkIn(context, sampleMissions[3].id, here(), NOW)))?.status).toBe(403);
    expect(writes()).toEqual([]);
  });

  it("answers where a person stands without saving anything", async () => {
    const inside = await checkPosition(context, MISSION_ID, "checkin", here(), NOW);
    expect(inside).toMatchObject({ inside: true, reason: null, radiusM: 50, hasPlace: true, accuracyM: 12 });
    const outside = await checkPosition(context, MISSION_ID, "checkin", here({ latitude: ALUN.latitude + 0.003 }), NOW);
    expect(outside).toMatchObject({ inside: false, reason: "terlalu-jauh", radiusM: 50 });
    expect(outside).not.toHaveProperty("distanceM");
    expect(inside).not.toHaveProperty("distanceM");
    expect(writes()).toEqual([]);
  });
});

describe("photo missions", () => {
  const photo = () => mission({ kind: "foto", points: 40 });
  const CLIENT = "33333333-3333-4333-8333-333333333333";
  const body = (over: Record<string, unknown> = {}) => ({ clientId: CLIENT, position: here(), size: 400_000, thumbSize: 40_000, width: 1280, height: 1600, ...over });

  beforeEach(() => { state.missions = [photo()]; });

  it("signs two uploads under tmp/ and a token, once the position passes", async () => {
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    const id = proofIdFor(viewer.id, MISSION_ID, CLIENT);
    expect(started.id).toBe(id);
    expect(started.uploads).toEqual({ besar: `https://storage.test/tmp/main-wam/misi/${id}.jpg`, kecil: `https://storage.test/tmp/main-wam/misi/${id}-kecil.jpg` });
    expect(started.token).toMatch(/^\d{10}\.[0-9a-f]{64}$/);
  });

  it("derives the proof's id from the person, the mission and the phone's photo: repeatable, never another person's", () => {
    expect(proofIdFor(viewer.id, MISSION_ID, CLIENT)).toBe(proofIdFor(viewer.id, MISSION_ID, CLIENT.toUpperCase()));
    expect(proofIdFor(viewer.id, MISSION_ID, CLIENT)).not.toBe(proofIdFor("44444444-4444-4444-8444-444444444444", MISSION_ID, CLIENT));
    expect(proofIdFor(viewer.id, MISSION_ID, CLIENT)).not.toBe(proofIdFor(viewer.id, "55555555-5555-4555-8555-555555555555", CLIENT));
  });

  it("does not sign anything for a person who is not in the area (no upload for nothing)", async () => {
    state.missions = [mission({ kind: "foto" })];
    expect(await refused(startPhoto(context, MISSION_ID, body({ position: here({ latitude: ALUN.latitude + 0.003 }) }), NOW))).toEqual({ status: 422, message: "Kamu belum berada di area misi." });
  });

  it("keeps a photo proof: copies the two files, records the position and the keys, removes the uploads", async () => {
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    const done = await confirmPhoto(context, MISSION_ID, { ...body(), token: started.token }, NOW);
    const id = started.id;
    expect(done.status).toBe("disetujui");
    expect(state.copied).toEqual([[`tmp/main-wam/misi/${id}.jpg`, `main-wam/misi/${id}.jpg`], [`tmp/main-wam/misi/${id}-kecil.jpg`, `main-wam/misi/${id}-kecil.jpg`]]);
    expect(writes()[0].row).toMatchObject({ source: "foto", status: "disetujui", proof_key: `main-wam/misi/${id}.jpg`, proof_thumb_key: `main-wam/misi/${id}-kecil.jpg`, mission_id: MISSION_ID, employee_id: viewer.id });
    expect(state.removed.flat()).toEqual(expect.arrayContaining([`tmp/main-wam/misi/${id}.jpg`]));
  });

  it("waits for review when the mission asks for it", async () => {
    state.missions = [{ ...photo(), review: true }];
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    expect((await confirmPhoto(context, MISSION_ID, { ...body(), token: started.token }, NOW)).status).toBe("menunggu");
  });

  it("refuses a token for other sizes, another photo or an expired time, before touching storage", async () => {
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    expect((await refused(confirmPhoto(context, MISSION_ID, { ...body({ size: 500_000 }), token: started.token }, NOW)))?.status).toBe(403);
    expect((await refused(confirmPhoto(context, MISSION_ID, { ...body({ clientId: "66666666-6666-4666-8666-666666666666" }), token: started.token }, NOW)))?.status).toBe(403);
    expect((await refused(confirmPhoto(context, MISSION_ID, { ...body(), token: started.token }, new Date(NOW.getTime() + 16 * 60_000))))?.status).toBe(403);
    expect(state.copied).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it("judges the position again at the second step", async () => {
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    expect(await refused(confirmPhoto(context, MISSION_ID, { ...body({ position: here({ latitude: ALUN.latitude + 0.003 }) }), token: started.token }, NOW)))
      .toEqual({ status: 422, message: "Kamu belum berada di area misi." });
    expect(state.copied).toEqual([]);
  });

  it("refuses files that are not JPEGs and removes them", async () => {
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    state.uploadedBytes = new Uint8Array(16).fill(1);
    try {
      expect(await refused(confirmPhoto(context, MISSION_ID, { ...body(), token: started.token }, NOW))).toEqual({ status: 422, message: "Isi berkas bukan foto JPEG. Ambil ulang fotonya." });
    } finally { state.uploadedBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]); }
    expect(state.copied).toEqual([]);
    expect(state.removed.length).toBeGreaterThan(0);
    expect(writes()).toEqual([]);
  });

  it("without a place, any usable fix is enough (a photo mission with no point)", async () => {
    state.missions = [{ ...photo(), latitude: null, longitude: null, placeName: "" }];
    const started = await startPhoto(context, MISSION_ID, body({ position: { latitude: 1, longitude: 2, accuracy: 20 } }), NOW);
    expect(started.uploads.besar).toContain("tmp/main-wam/misi/");
    expect(await refused(startPhoto(context, MISSION_ID, body({ position: { latitude: 1, longitude: 2, accuracy: 900 } }), NOW))).toEqual({ status: 422, message: "Lokasi kurang teliti. Coba di tempat terbuka." });
  });

  it("leaves the kept files alone when a race lost to the first confirmation (409)", async () => {
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    state.insertError = { code: "23505", message: "duplicate key" };
    expect((await refused(confirmPhoto(context, MISSION_ID, { ...body(), token: started.token }, NOW)))?.status).toBe(409);
    expect(state.removed.flat().some(key => key.startsWith("main-wam/misi/"))).toBe(false);
  });

  it("removes the files of an earlier, rejected proof when a new one replaces them", async () => {
    state.existing = { id: "c0", mission_id: MISSION_ID, employee_id: viewer.id, status: "ditolak", source: "foto", proof_key: "main-wam/misi/lama.jpg", proof_thumb_key: "main-wam/misi/lama-kecil.jpg" };
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    await confirmPhoto(context, MISSION_ID, { ...body(), token: started.token }, NOW);
    expect(state.removed.flat()).toEqual(expect.arrayContaining(["main-wam/misi/lama.jpg", "main-wam/misi/lama-kecil.jpg"]));
    expect(state.removed.flat()).not.toContain(`main-wam/misi/${started.id}.jpg`);
  });

  it("removes its own files when another photo of this person won the race (409)", async () => {
    state.existing = { id: "c0", mission_id: MISSION_ID, employee_id: viewer.id, status: "ditolak", source: "foto", proof_key: "main-wam/misi/lain.jpg", proof_thumb_key: "main-wam/misi/lain-kecil.jpg" };
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    state.insertError = { code: "23505", message: "duplicate key" };
    expect((await refused(confirmPhoto(context, MISSION_ID, { ...body(), token: started.token }, NOW)))?.status).toBe(409);
    expect(state.removed.flat()).toContain(`main-wam/misi/${started.id}.jpg`);
    expect(state.removed.flat()).not.toContain("main-wam/misi/lain.jpg");
  });

  it("removes what it kept when saving fails for another reason", async () => {
    const started = await startPhoto(context, MISSION_ID, body(), NOW);
    state.insertError = { code: "XX000", message: "boom" };
    expect((await refused(confirmPhoto(context, MISSION_ID, { ...body(), token: started.token }, NOW)))?.status).toBeGreaterThanOrEqual(500);
    expect(state.removed.flat()).toContain(`main-wam/misi/${started.id}.jpg`);
  });
});
