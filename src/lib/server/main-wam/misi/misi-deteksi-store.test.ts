import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Where detection keeps its notes, without a database: the photo's position is written once, in its own table; before migration
 * 202611300003 every reader answers empty and every writer stays quiet, and the person's switch is then "off" (suggestions only).
 */

const state = vi.hoisted(() => ({ answer: { data: null as unknown, error: null as null | { code?: string; message?: string } }, calls: [] as { table: string; ops: [string, unknown[]][] }[] }));
vi.mock("../../supabase/admin", () => ({
  createPrivilegedClient: () => ({
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      state.calls.push(call);
      const proxy: unknown = new Proxy({}, { get(_target, prop) {
        if (prop === "then") return (resolve: (value: unknown) => void) => Promise.resolve(state.answer).then(resolve);
        if (prop === "maybeSingle") return () => Promise.resolve(state.answer);
        return (...args: unknown[]) => { call.ops.push([String(prop), args]); return proxy; };
      } });
      return proxy;
    },
  }),
}));

const store = await import("./deteksi-store");
const PHOTO = "33333333-3333-4333-8333-333333333333";
const ME = "11111111-1111-4111-8111-111111111111";
const missing = { code: "42P01", message: 'relation "public.mw_photo_signals" does not exist' };
beforeEach(() => { state.answer = { data: null, error: null }; state.calls = []; });

describe("the photo's signals", () => {
  it("keeps the position as three columns of its own table, and the accuracy rounded", async () => {
    expect(await store.saveSignals({ photoId: PHOTO, ownerId: ME, live: true, geo: { latitude: -7.88, longitude: 112.52, accuracy: 13.6 } })).toBe(true);
    expect(state.calls[0]).toMatchObject({ table: "mw_photo_signals" });
    expect(state.calls[0].ops[0]).toEqual(["upsert", [{ photo_id: PHOTO, owner_id: ME, live: true, geo_lat: -7.88, geo_lng: 112.52, geo_acc: 14 }, { onConflict: "photo_id" }]]);
  });

  it("keeps no position when none was shared, and says false (quietly) before the migration", async () => {
    await store.saveSignals({ photoId: PHOTO, ownerId: ME, live: false, geo: null });
    expect(state.calls[0].ops[0][1]).toEqual([expect.objectContaining({ live: false, geo_lat: null, geo_lng: null, geo_acc: null }), expect.anything()]);
    state.answer = { data: null, error: missing };
    expect(await store.saveSignals({ photoId: PHOTO, ownerId: ME, live: true, geo: null })).toBe(false);
  });

  it("reads them back for the server's match only, empty before the migration", async () => {
    state.answer = { data: [{ photo_id: PHOTO, live: true, geo_lat: -7.88, geo_lng: 112.52, geo_acc: 14, checked_at: null }], error: null };
    const read = await store.signalsOf([PHOTO]);
    expect(read.get(PHOTO)).toEqual({ photoId: PHOTO, live: true, checkedAt: null, geo: { latitude: -7.88, longitude: 112.52, accuracy: 14 } });
    state.answer = { data: null, error: missing };
    expect((await store.signalsOf([PHOTO])).size).toBe(0);
    expect((await store.signalsOf([])).size).toBe(0);
  });
});

describe("detections and the person's switch", () => {
  it("keeps what was done for a photo and a mission, once, and reads it back", async () => {
    await store.recordDetection({ photoId: PHOTO, missionId: "m", status: "cocok", outcome: "diajukan", completionId: "c", reasons: ["a"] });
    expect(state.calls[0].ops[0]).toEqual(["upsert", [expect.objectContaining({ photo_id: PHOTO, mission_id: "m", outcome: "diajukan", completion_id: "c", reasons: ["a"] }), { onConflict: "photo_id,mission_id" }]]);
    state.answer = { data: [{ photo_id: PHOTO, mission_id: "m", status: "mungkin", outcome: "saran", completion_id: null, reasons: ["x"], created_at: "t" }, { photo_id: PHOTO, mission_id: "n", status: "cocok", outcome: "aneh", completion_id: null, reasons: [], created_at: "t" }], error: null };
    expect(await store.detectionsOf([PHOTO])).toEqual([{ photoId: PHOTO, missionId: "m", status: "mungkin", outcome: "saran", completionId: null, reasons: ["x"], createdAt: "t" }]);
  });

  it("the switch is on by default once the table is there, saved as asked, and off (suggestions only) before it", async () => {
    state.answer = { data: null, error: null };
    expect(await store.readAutoPref(ME)).toEqual({ on: true, stored: true });
    state.answer = { data: { auto_detect: false }, error: null };
    expect(await store.readAutoPref(ME)).toEqual({ on: false, stored: true });
    state.answer = { data: null, error: { code: "42P01", message: 'relation "public.mw_misi_prefs" does not exist' } };
    expect(await store.readAutoPref(ME)).toEqual({ on: false, stored: false });
    await expect(store.saveAutoPref(ME, true)).rejects.toMatchObject({ status: 503 });
  });

  it("marks photos as looked at, creating a row for one that has none", async () => {
    state.answer = { data: [{ photo_id: PHOTO, live: true, geo_lat: null, geo_lng: null, geo_acc: null, checked_at: null }], error: null };
    await store.markChecked([{ id: PHOTO, ownerId: ME }, { id: "other", ownerId: ME }]);
    const writes = state.calls.flatMap(call => call.ops.filter(([name]) => ["update", "upsert"].includes(name)).map(([name, args]) => ({ name, row: args[0] })));
    expect(writes).toContainEqual({ name: "update", row: { checked_at: expect.any(String) } });
    expect(writes).toContainEqual({ name: "upsert", row: [expect.objectContaining({ photo_id: "other", owner_id: ME, live: true, checked_at: expect.any(String) })] });
  });
});
