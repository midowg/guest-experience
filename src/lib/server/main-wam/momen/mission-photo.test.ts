import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A mission's proof as a Momen photo, without a database: the three kept files are copied to the
 * photo's own keys, the photo is for everyone and carries its mission, it waits ("ditinjau") until the
 * proof is approved, approval shows it, rejection removes it, and it is made once however often it is asked.
 */

vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => "s".repeat(40) }));
const OWNER = "11111111-1111-4111-8111-111111111111";
const MISSION = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  insertError: null as { code?: string; message?: string } | null,
  deleteError: null as { code?: string; message?: string } | null,
  calls: [] as { table: string; ops: [string, unknown[]][] }[],
  copied: [] as [string, string][],
  removed: [] as string[][],
  rows: {} as Record<string, unknown[]>,
}));
function chain(table: string) {
  const call = { table, ops: [] as [string, unknown[]][] };
  state.calls.push(call);
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
          const names = call.ops.map(([name]) => name);
          if (names.includes("insert")) return Promise.resolve(state.insertError ? { data: null, error: state.insertError } : { data: { id: (call.ops.find(([name]) => name === "insert")![1][0] as { id: string }).id }, error: null }).then(resolve, reject);
          if (names.includes("delete")) return Promise.resolve({ data: null, error: state.deleteError }).then(resolve, reject);
          if (names.includes("update")) return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          return Promise.resolve({ data: names.includes("maybeSingle") ? state.existing : state.rows[table] ?? [], error: null }).then(resolve, reject);
        };
      }
      return (...args: unknown[]) => { call.ops.push([String(prop), args]); return proxy; };
    },
  });
  return proxy;
}
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: chain }) }));
vi.mock("../../r2", () => ({
  isR2Configured: () => true, copyObject: async (from: string, to: string) => { state.copied.push([from, to]); },
  removeObjects: async (keys: string[]) => { state.removed.push(keys); }, presignUpload: async () => "", presignDownload: async () => "", uploadedStart: async () => new Uint8Array(),
}));

const photo = await import("./mission-photo");
const { photoIdFor } = await import("./storage");
const NOW = new Date("2027-01-05T10:00:00+07:00");
const proof = { besar: "main-wam/misi/p.jpg", kecil: "main-wam/misi/p-kecil.jpg", ubin: "main-wam/misi/p-ubin.jpg" };
const input = (approved = false) => ({ ownerId: OWNER, clientId: CLIENT, proof, size: 400_000, width: 1200, height: 1500, takenAt: NOW.toISOString(), missionId: MISSION, approved });
const inserted = () => state.calls.flatMap(call => call.ops.filter(([name]) => name === "insert").map(([, args]) => args[0] as Record<string, unknown>));
const refused = async (promise: Promise<unknown>) => promise.then(() => null, (error: { status: number; message: string }) => ({ status: error.status }));

beforeEach(() => { state.existing = null; state.insertError = null; state.deleteError = null; state.calls = []; state.copied = []; state.removed = []; state.rows = {}; });

describe("a proof as a Momen photo", () => {
  it("copies the three files to the photo's keys and makes a photo for everyone that carries its mission, waiting until approval", async () => {
    const id = await photo.createMissionPhoto(input(), NOW);
    expect(id).toBe(photoIdFor(OWNER, CLIENT));
    expect(state.copied).toEqual([[proof.besar, `main-wam/momen/${id}.jpg`], [proof.kecil, `main-wam/momen/${id}-kecil.jpg`], [proof.ubin, `main-wam/momen/${id}-ubin.jpg`]]);
    expect(inserted()[0]).toMatchObject({
      id, owner_id: OWNER, audience: "semua", group_id: null, session_id: null, file_key: `main-wam/momen/${id}.jpg`, thumb_key: `main-wam/momen/${id}-kecil.jpg`,
      tile_key: `main-wam/momen/${id}-ubin.jpg`, mission_id: MISSION, status: "ditinjau", size: 400_000,
    });
  });

  it("is shown at once when the proof is already approved", async () => {
    await photo.createMissionPhoto(input(true), NOW);
    expect(inserted()[0]).toMatchObject({ status: "tampil" });
  });

  it("is made once: asked again it finds the photo and copies nothing", async () => {
    state.existing = { id: photoIdFor(OWNER, CLIENT), owner_id: OWNER, audience: "semua", width: 1, height: 1, taken_at: NOW.toISOString(), created_at: NOW.toISOString(), visible_at: NOW.toISOString(), status: "ditinjau", file_key: "x", thumb_key: null, tile_key: null };
    expect(await photo.createMissionPhoto(input(), NOW)).toBe(photoIdFor(OWNER, CLIENT));
    expect(state.copied).toEqual([]);
    expect(inserted()).toEqual([]);
  });

  it("removes what it copied when the photo cannot be saved, and waits when the migration is not there", async () => {
    state.insertError = { code: "42703", message: "column mission_id does not exist" };
    expect(await refused(photo.createMissionPhoto(input(), NOW))).toEqual({ status: 503 });
    expect(state.removed.flat()).toEqual(expect.arrayContaining([`main-wam/momen/${photoIdFor(OWNER, CLIENT)}.jpg`]));
  });

  it("shows the photo at approval only if it was waiting and not hidden by panitia", async () => {
    await photo.publishMissionPhoto("p1", NOW);
    const call = state.calls.find(item => item.ops.some(([name]) => name === "update"))!;
    expect(call.ops).toContainEqual(["update", [{ status: "tampil", visible_at: NOW.toISOString() }]]);
    expect(call.ops).toContainEqual(["eq", ["status", "ditinjau"]]);
    expect(call.ops).toContainEqual(["is", ["hidden_by", null]]);
  });

  it("removes the photo and its files at rejection; a photo that cannot be deleted (nominated) is only hidden", async () => {
    const id = photoIdFor(OWNER, CLIENT);
    state.existing = { id, owner_id: OWNER, audience: "semua", width: 1, height: 1, taken_at: NOW.toISOString(), created_at: NOW.toISOString(), visible_at: NOW.toISOString(), status: "ditinjau", file_key: `main-wam/momen/${id}.jpg`, thumb_key: `main-wam/momen/${id}-kecil.jpg`, tile_key: `main-wam/momen/${id}-ubin.jpg` };
    await photo.withdrawMissionPhoto(id);
    expect(state.calls.some(call => call.table === "mw_photos" && call.ops.some(([name]) => name === "delete"))).toBe(true);
    expect(state.removed.flat()).toEqual(expect.arrayContaining([`main-wam/momen/${id}.jpg`, `main-wam/momen/${id}-ubin.jpg`]));
    state.calls = []; state.removed = [];
    state.deleteError = { code: "23503", message: "nominated" };
    await photo.withdrawMissionPhoto(id);
    expect(state.calls.some(call => call.ops.some(([name, args]) => name === "update" && (args[0] as { status: string }).status === "disembunyikan"))).toBe(true);
    expect(state.removed).toEqual([]);
  });

  it("labels the photos made from a proof, for Momen's screens: 'Misi: <judul>'", async () => {
    state.rows.mw_photos = [{ id: "a1111111-1111-4111-8111-111111111111", mission_id: MISSION }];
    state.rows.mw_missions = [{ id: MISSION, title: "Foto bareng KEDUA BOD" }];
    const labels = await photo.missionLabelsOf(["a1111111-1111-4111-8111-111111111111", "bukan-id"]);
    expect([...labels.entries()]).toEqual([["a1111111-1111-4111-8111-111111111111", "Misi: Foto bareng KEDUA BOD"]]);
    expect((await photo.missionLabelsOf([])).size).toBe(0);
  });
});
