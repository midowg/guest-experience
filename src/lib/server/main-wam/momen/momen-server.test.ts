import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MainWamContext } from "../gate";
import type { PhotoRecord } from "./feed";

/*
 * Area B's server rules, without a database: the upload's token (every photo is for everyone), the
 * limits, a photo sent twice kept once, who may delete, report, react to or open a photo (and who gets 404).
 */

const SECRET = "s".repeat(40);
vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => SECRET }));
vi.mock("../../config", async original => ({ ...(await original<object>()), rateLimitSecret: () => "r".repeat(40) }));

let records = new Map<string, PhotoRecord>();
let counts = { tenMinutes: 0, today: 0 };
let inserted: Record<string, unknown>[] = [];
let deleted: string[] = [];
let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let reactorsAnswer: { data: unknown; error: { message: string; code?: string } | null } = { data: [], error: null };
let reactAnswer: { data: unknown; error: { message: string; code?: string } | null } = { data: [], error: null };
let reportAnswer: { data: unknown; error: { message: string; code?: string } | null } = { data: [{ reporters: 1, hidden: false, owner_id: "sari" }], error: null };
let deleteError: { message: string; code?: string } | null = null;
let insertError: { message: string; code?: string } | null = null;
let recordError: { message: string; code?: string } | null = null;
let versionAnswer = "fingerprint-1";
let feedRows: Record<string, unknown>[] = [];
let unseenAnswer: { data: unknown; error: { code: string; message: string } | null } = { data: 0, error: null };
let tileRows: { tile: number; photo_id: string; mw_photos: { owner_id: string; status: string; tile_key: string | null } }[] = [];
const removed: string[] = [];
const uploadsRemoved: string[] = [];
const steps: string[] = [];
let copyFails = false;
let checkFails = false;
let duringCheck: (() => void) | null = null;

function query(table: string) {
  const state: { filters: [string, unknown][]; head: boolean } = { filters: [], head: false };
  const chain = {
    select: (_columns: string, options?: { head?: boolean }) => { state.head = !!options?.head; return chain; },
    eq: (column: string, value: unknown) => { state.filters.push([column, value]); return chain; },
    gte: (column: string, value: unknown) => {
      state.filters.push([column, value]);
      // The day's start (WIB midnight = 17.00 UTC) or ten minutes ago.
      return Promise.resolve({ count: String(value).endsWith("T17:00:00.000Z") ? counts.today : counts.tenMinutes, error: null });
    },
    in: () => chain,
    lt: () => chain,
    order: () => chain,
    // The Mozaik's tiles.
    limit: () => Promise.resolve({ data: tileRows, error: null }),
    // One photo's row by id (feed.ts reads its own photoRecord through here).
    maybeSingle: () => {
      if (recordError) return Promise.resolve({ data: null, error: recordError });
      const id = state.filters.find(([column]) => column === "id")?.[1] as string | undefined;
      const found = id ? records.get(id) : undefined;
      return Promise.resolve({ data: found ? {
        id: found.id, owner_id: found.ownerId, audience: found.audience, group_id: found.groupId, session_id: found.sessionId, width: found.width, height: found.height,
        taken_at: found.takenAt, created_at: found.createdAt, visible_at: found.visibleAt, status: found.status, file_key: found.fileKey, thumb_key: found.thumbKey, tile_key: found.tileKey,
      } : null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      inserted.push(row);
      steps.push("insert");
      return { select: () => ({ single: () => Promise.resolve(insertError ? { data: null, error: insertError } : { data: { id: row.id, visible_at: "2027-01-05T08:20:05Z" }, error: null }) }) };
    },
    delete: () => ({ eq: (_column: string, id: string) => { if (!deleteError) deleted.push(id); return Promise.resolve({ error: deleteError }); } }),
    then: undefined,
  };
  void table;
  return chain;
}
vi.mock("../../supabase/admin", () => ({
  createPrivilegedClient: () => ({
    from: query,
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "consume_rate_limit") return Promise.resolve({ data: true, error: null });
      if (name === "mw_photo_report") return Promise.resolve(reportAnswer);
      if (name === "mw_photo_react") return Promise.resolve(reactAnswer);
      if (name === "mw_photo_reactors") return Promise.resolve(reactorsAnswer);
      if (name === "mw_photo_feed") return Promise.resolve({ data: feedRows.slice(0, Number(args.p_limit)), error: null });
      if (name === "mw_photo_unseen_count") return Promise.resolve(unseenAnswer);
      if (name === "mw_mosaic_version") return Promise.resolve({ data: versionAnswer, error: null });
      return Promise.resolve({ data: [], error: null });
    },
  }),
}));
vi.mock("../read", () => ({
  allSessions: async () => ({ data: [{ id: "00000000-0000-4000-8000-0000000000aa", status: "terbit" }, { id: "00000000-0000-4000-8000-0000000000bb", status: "draf" }], migrated: true }),
  sessionById: async (id: string) => (id === "00000000-0000-4000-8000-0000000000aa" ? { id, title: "Pemaparan departemen" } : null),
}));
vi.mock("../notes", () => ({ trySendMainWamNote: vi.fn(async () => 1) }));
vi.mock("../people", () => ({ mainWamPeople: async () => new Map([["sari", { id: "sari", name: "Sari", photo: null }], ["11111111-1111-4111-8111-111111111111", { id: "11111111-1111-4111-8111-111111111111", name: "Rani", photo: "/foto/rani" }]]) }));
vi.mock("next/server", () => ({ after: (work: () => unknown) => { void work(); } }));
// Mission detection runs after the answer (misi/deteksi.ts); here only that it is asked for, with what the phone sent, and never fails the photo.
const detection = vi.hoisted(() => ({ calls: [] as { photo: { id: string; visibleAt: string }; input: unknown }[], fails: false }));
vi.mock("../misi/deteksi", () => ({ scheduleAfterMomenSaved: (_context: unknown, photo: { id: string; visibleAt: string }, input: unknown) => { detection.calls.push({ photo, input }); if (detection.fails) throw new Error("deteksi rusak"); } }));
vi.mock("./storage", async original => {
  const real = await original<typeof import("./storage")>();
  return {
    ...real,
    storageReady: () => true,
    uploadAddresses: async (id: string) => ({ besar: `https://r2/${id}.jpg?put`, kecil: `https://r2/${id}-kecil.jpg?put`, ubin: `https://r2/${id}-ubin.jpg?put` }),
    checkUploaded: async () => {
      steps.push("check");
      duringCheck?.();
      if (checkFails) throw Object.assign(new Error("Berkas belum terunggah."), { status: 422 });
    },
    keepUploaded: async (id: string) => {
      steps.push("copy");
      if (copyFails) throw Object.assign(new Error("Foto belum dapat disimpan."), { status: 503 });
      return real.keysOf(id);
    },
    removeUploads: async (id: string) => { steps.push("removeUploads"); uploadsRemoved.push(id); },
    removePhotoFiles: async (id: string) => { removed.push(id); },
    viewAddress: async (key: string | null, size: string, _now?: number, download?: string) => (key ? `https://r2/${key}?get&size=${size}${download ? `&unduh=${download}` : ""}` : null),
  };
});
vi.mock("./feed", async original => {
  const real = await original<typeof import("./feed")>();
  return { ...real, photoRecord: async (id: string) => records.get(id) ?? null };
});

const upload = await import("./upload");
const feed = await import("./feed");
const files = await import("./files");
const storage = await import("./storage");
const mosaic = await import("./mosaic");

const g4 = { id: "00000000-0000-4000-8000-000000000004", number: 4, name: "Arjuno", coordinator: false, size: 10 };
function context(over: Partial<MainWamContext["viewer"]> = {}): MainWamContext {
  return {
    viewer: { id: "11111111-1111-4111-8111-111111111111", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles: [], tester: false, group: g4, room: null, ...over },
    settings: { groupsPublished: true, modules: { mozaik: true } } as MainWamContext["settings"],
  };
}
const HEART = "\u2764\uFE0F";
const start = { clientId: "22222222-2222-4222-8222-222222222222", sessionId: null, takenAt: new Date().toISOString(), width: 1280, height: 1600, size: 400_000, thumbSize: 40_000, tileSize: 9_000 };
const record = (over: Partial<PhotoRecord> = {}): PhotoRecord => ({
  id: "33333333-3333-4333-8333-333333333333", ownerId: "sari", audience: "semua", groupId: null, sessionId: null, width: 1280, height: 1600, takenAt: "2026-01-05T03:00:00Z",
  createdAt: "2026-01-05T03:00:00Z", visibleAt: "2026-01-05T03:00:05Z", status: "tampil",
  fileKey: "main-wam/momen/33333333-3333-4333-8333-333333333333.jpg", thumbKey: null, tileKey: null, ...over,
});
const statusOf = (promise: Promise<unknown>) => promise.then(() => 200, (error: { status?: number }) => error.status ?? 500);

beforeEach(() => {
  records = new Map(); counts = { tenMinutes: 0, today: 0 }; inserted = []; deleted = []; rpcCalls = []; removed.length = 0;
  reportAnswer = { data: [{ reporters: 1, hidden: false, owner_id: "sari" }], error: null };
  reactorsAnswer = { data: [], error: null };
  reactAnswer = { data: [{ emoji: HEART, count: 2, mine: true }, { emoji: "😂", count: 1, mine: false }], error: null };
  deleteError = null; insertError = null; recordError = null; versionAnswer = "fingerprint-1"; tileRows = []; feedRows = []; unseenAnswer = { data: 0, error: null };
  uploadsRemoved.length = 0; steps.length = 0; copyFails = false; checkFails = false; duringCheck = null;
});

describe("the photo's id and upload token", () => {
  it("are stable for one owner's phone photo, different for another owner, and unguessable in shape", () => {
    const a = storage.photoIdFor("rani", start.clientId, SECRET);
    expect(storage.photoIdFor("rani", start.clientId.toUpperCase(), SECRET)).toBe(a);
    expect(storage.photoIdFor("dimas", start.clientId, SECRET)).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(storage.keysOf(a).ubin).toBe(`main-wam/momen/${a}-ubin.jpg`);
  });

  it("bind the agreed sizes until the token expires", () => {
    const agreed = { id: "x", size: 1, thumbSize: 2, tileSize: 3, width: 4, height: 5 };
    const token = storage.uploadToken(agreed, 1_000_000, SECRET);
    expect(storage.tokenMatches(token, agreed, 1_000_000, SECRET)).toBe(true);
    expect(storage.tokenMatches(token, { ...agreed, size: 9 }, 1_000_000, SECRET)).toBe(false);
    expect(storage.tokenMatches(token, agreed, 1_000_000 + 16 * 60_000, SECRET)).toBe(false);
    expect(storage.tokenMatches(token, agreed, 1_000_000, "z".repeat(40))).toBe(false);
  });
});

describe("sending a photo", () => {
  it("signs three uploads, and answers the photo already kept for a retry", async () => {
    const first = await upload.startUpload(context(), start);
    expect(first.kind).toBe("unggah");
    if (first.kind !== "unggah") return;
    expect(first.uploads.ubin).toContain("-ubin.jpg");
    records.set(first.id, record({ id: first.id, ownerId: context().viewer.id }));
    expect(await upload.startUpload(context(), start)).toMatchObject({ kind: "selesai", id: first.id });
  });

  it("refuses a person over the limits (429), and starts for a person with no kelompok too (every photo is for everyone)", async () => {
    expect((await upload.startUpload(context({ group: null }), start)).kind).toBe("unggah");
    counts = { tenMinutes: 30, today: 30 };
    expect(await statusOf(upload.startUpload(context(), start))).toBe(429);
    counts = { tenMinutes: 0, today: 200 };
    expect(await statusOf(upload.startUpload(context(), start))).toBe(429);
  });

  it("keeps a photo only with its own token; it is always for everyone (an audience in the request is ignored) and the session comes from the server", async () => {
    const begun = await upload.startUpload(context(), start);
    if (begun.kind !== "unggah") throw new Error("expected an upload");
    expect(await statusOf(upload.confirmUpload(context(), { ...start, token: `${Math.floor(Date.now() / 1000) + 60}.${"0".repeat(64)}` }))).toBe(403);
    // Another person replaying the token: a different photo id, refused.
    expect(await statusOf(upload.confirmUpload(context({ id: "44444444-4444-4444-8444-444444444444" }), { ...start, token: begun.token }))).toBe(403);
    const done = await upload.confirmUpload(context(), { ...start, audience: "kelompok", group: "x", sessionId: "00000000-0000-4000-8000-0000000000bb", token: begun.token } as unknown as Parameters<typeof upload.confirmUpload>[1]);
    expect(done.id).toBe(begun.id);
    expect(inserted[0]).toMatchObject({ id: begun.id, audience: "semua", group_id: null, session_id: null, tile_key: `main-wam/momen/${begun.id}-ubin.jpg` });
  });
});

describe("mission detection after a photo is kept", () => {
  const geo = { latitude: -7.88, longitude: 112.52, accuracy: 14 };
  const tags = ["22222222-2222-4222-8222-222222222222"];
  beforeEach(() => { detection.calls = []; detection.fails = false; });

  it("is asked for once the photo is kept, with the friends tagged, the position and the gallery flag the phone sent", async () => {
    const begun = await upload.startUpload(context(), { ...start, tags, geo, gallery: false });
    if (begun.kind !== "unggah") throw new Error("expected an upload");
    const done = await upload.confirmUpload(context(), { ...start, tags, geo, gallery: false, token: begun.token });
    expect(detection.calls).toEqual([{ photo: { id: done.id, visibleAt: "2027-01-05T08:20:05Z" }, input: { tags, geo, gallery: false } }]);
    expect(steps.indexOf("insert")).toBeGreaterThan(-1);
  });

  it("an older phone sends none of it: detection still looks at the photo, with no tags and no position", async () => {
    const begun = await upload.startUpload(context(), start);
    if (begun.kind !== "unggah") throw new Error("expected an upload");
    await upload.confirmUpload(context(), { ...start, token: begun.token });
    expect(detection.calls[0].input).toEqual({ tags: [], geo: null, gallery: false });
  });

  it("is not asked for a photo that was already kept (a repeat) or that failed to be kept", async () => {
    const begun = await upload.startUpload(context(), start);
    if (begun.kind !== "unggah") throw new Error("expected an upload");
    copyFails = true;
    await statusOf(upload.confirmUpload(context(), { ...start, token: begun.token }));
    copyFails = false;
    records.set(begun.id, record({ id: begun.id, ownerId: context().viewer.id }));
    await upload.confirmUpload(context(), { ...start, token: begun.token });
    expect(detection.calls).toEqual([]);
  });

  it("a detection that breaks never stops the photo from being kept: it is already saved and the answer is the same", async () => {
    detection.fails = true;
    const begun = await upload.startUpload(context(), start);
    if (begun.kind !== "unggah") throw new Error("expected an upload");
    const done = await upload.confirmUpload(context(), { ...start, token: begun.token });
    expect(done.id).toBe(begun.id);
    expect(inserted).toHaveLength(1);
  });
});

describe("uploads never kept do not pile up (audit L4)", () => {
  it("uploads under tmp/, keeps under main-wam/momen/ (the moderation's prefix), the same name", () => {
    const id = storage.photoIdFor("rani", start.clientId, SECRET);
    expect(storage.uploadKeysOf(id)).toEqual({ besar: `tmp/main-wam/momen/${id}.jpg`, kecil: `tmp/main-wam/momen/${id}-kecil.jpg`, ubin: `tmp/main-wam/momen/${id}-ubin.jpg` });
    expect(Object.values(storage.keysOf(id)).every(key => key.startsWith(storage.PHOTO_PREFIX) && !key.startsWith(storage.UPLOAD_PREFIX))).toBe(true);
    expect(storage.UPLOAD_PREFIX.startsWith("tmp/")).toBe(true);
  });

  it("keeps a photo by checking, copying, saving, then removing the uploads, in that order", async () => {
    const begun = await upload.startUpload(context(), start);
    if (begun.kind !== "unggah") throw new Error("expected an upload");
    await upload.confirmUpload(context(), { ...start, token: begun.token });
    expect(steps).toEqual(["check", "copy", "insert", "removeUploads"]);
    expect(inserted[0]).toMatchObject({ file_key: `main-wam/momen/${begun.id}.jpg`, thumb_key: `main-wam/momen/${begun.id}-kecil.jpg` });
    expect(uploadsRemoved).toEqual([begun.id]);
  });

  it("a failed copy answers 503 (the queue tries again) and keeps nothing; a lost race answers the photo kept", async () => {
    const begun = await upload.startUpload(context(), start);
    if (begun.kind !== "unggah") throw new Error("expected an upload");
    copyFails = true;
    expect(await statusOf(upload.confirmUpload(context(), { ...start, token: begun.token }))).toBe(503);
    expect(inserted).toEqual([]);
    // The first request kept it and removed the uploads while this repeat was checking them.
    copyFails = false; checkFails = true;
    duringCheck = () => records.set(begun.id, record({ id: begun.id, ownerId: context().viewer.id, visibleAt: "2027-01-05T08:20:05Z" }));
    expect(await upload.confirmUpload(context(), { ...start, token: begun.token })).toEqual({ id: begun.id, visibleAt: "2027-01-05T08:20:05Z" });
    expect(inserted).toEqual([]);
    // Not kept by anyone: the check's 422 stands.
    records.delete(begun.id); duringCheck = null;
    expect(await statusOf(upload.confirmUpload(context(), { ...start, token: begun.token }))).toBe(422);
  });
});

describe("reacting to a photo", () => {
  const OTHER = "55555555-5555-4555-8555-555555555555";
  const reactCalls = () => rpcCalls.filter(call => call.name === "mw_photo_react");

  it("asks the database with the person and the kelompok the server knows, and answers the photo's reactions", async () => {
    records.set(record().id, record());
    const answer = await feed.setReaction(context().viewer, record().id, HEART);
    expect(answer).toEqual({ reactions: [{ emoji: HEART, count: 2, mine: true }, { emoji: "😂", count: 1, mine: false }] });
    expect(reactCalls()).toEqual([{ name: "mw_photo_react", args: { p_photo: record().id, p_viewer: context().viewer.id, p_group: g4.id, p_emoji: HEART } }]);
    reactAnswer = { data: [], error: null };
    expect(await feed.setReaction(context().viewer, record().id, null)).toEqual({ reactions: [] });
    expect(reactCalls()[1].args.p_emoji).toBeNull();
  });

  it("never on one's own photo (409), but one's own reaction may be taken back", async () => {
    records.set(record().id, record({ ownerId: context().viewer.id }));
    expect(await statusOf(feed.setReaction(context().viewer, record().id, HEART))).toBe(409);
    expect(reactCalls()).toEqual([]);
    expect(await statusOf(feed.setReaction(context().viewer, record().id, null))).toBe(200);
  });

  it("answers 404, nothing about the photo, for one the person cannot see: hidden, in its 5 seconds, another kelompok's, unknown", async () => {
    records.set(record().id, record({ status: "ditinjau" }));
    records.set(OTHER, record({ id: OTHER, audience: "kelompok", groupId: "other" }));
    const fresh = "66666666-6666-4666-8666-666666666666";
    records.set(fresh, record({ id: fresh, visibleAt: new Date(Date.now() + 60_000).toISOString() }));
    for (const id of [record().id, OTHER, fresh, "77777777-7777-4777-8777-777777777777", "bukan-id"]) expect(await statusOf(feed.setReaction(context().viewer, id, HEART)), id).toBe(404);
    expect(reactCalls()).toEqual([]);
  });

  it("turns the database's refusals into plain answers (404 not found, 409 own photo) and a waiting migration into 503", async () => {
    records.set(record().id, record());
    reactAnswer = { data: null, error: { message: "MW_PHOTO_NOT_FOUND" } };
    expect(await statusOf(feed.setReaction(context().viewer, record().id, HEART))).toBe(404);
    reactAnswer = { data: null, error: { message: "MW_PHOTO_OWN" } };
    expect(await statusOf(feed.setReaction(context().viewer, record().id, HEART))).toBe(409);
    reactAnswer = { data: null, error: { message: "Could not find the function public.mw_photo_react", code: "PGRST202" } };
    expect(await statusOf(feed.setReaction(context().viewer, record().id, HEART))).toBe(503);
  });
});

describe("who reacted with what", () => {
  const rani = "11111111-1111-4111-8111-111111111111";
  const reactorCalls = () => rpcCalls.filter(call => call.name === "mw_photo_reactors");
  const rows = [
    { employee_id: rani, emoji: HEART, created_at: "2027-01-05T03:02:00Z" },
    { employee_id: "sari", emoji: "😂", created_at: "2027-01-05T03:01:00Z" },
    { employee_id: "someone-new", emoji: "🔥", created_at: "2027-01-05T03:00:00Z" },
    { employee_id: "sari", emoji: "🤡", created_at: "2027-01-05T03:00:00Z" },
  ];

  it("answers each reaction with the nama panggilan, marks the person's own, drops what is off the list, and asks the database as the person", async () => {
    records.set(record({ ownerId: "bukan-rani" }).id, record({ ownerId: "bukan-rani" }));
    reactorsAnswer = { data: rows, error: null };
    const answer = await feed.photoReactors(context().viewer, record().id);
    expect(answer.reactors).toEqual([
      { person: { id: rani, name: "Rani", photo: "/foto/rani", department: "" }, emoji: HEART, mine: true, at: "2027-01-05T03:02:00Z" },
      { person: { id: "sari", name: "Sari", photo: null, department: "" }, emoji: "😂", mine: false, at: "2027-01-05T03:01:00Z" },
      { person: { id: "someone-new", name: "Rekan", photo: null, department: "" }, emoji: "🔥", mine: false, at: "2027-01-05T03:00:00Z" },
    ]);
    expect(reactorCalls()).toEqual([{ name: "mw_photo_reactors", args: { p_photo: record().id, p_viewer: rani } }]);
  });

  it("answers 404 for a photo the person cannot see (hidden, in its 5 seconds, another kelompok's, unknown) without asking the database", async () => {
    records.set(record().id, record({ status: "disembunyikan" }));
    const OTHER = "55555555-5555-4555-8555-555555555555";
    records.set(OTHER, record({ id: OTHER, audience: "kelompok", groupId: "other" }));
    const fresh = "66666666-6666-4666-8666-666666666666";
    records.set(fresh, record({ id: fresh, visibleAt: new Date(Date.now() + 60_000).toISOString() }));
    for (const id of [record().id, OTHER, fresh, "77777777-7777-4777-8777-777777777777", "bukan-id"]) expect(await statusOf(feed.photoReactors(context().viewer, id)), id).toBe(404);
    expect(reactorCalls()).toEqual([]);
  });

  it("lets the owner see who reacted to their own photo, and says a waiting migration is a plain 503", async () => {
    records.set(record().id, record({ ownerId: rani }));
    reactorsAnswer = { data: rows.slice(1, 2), error: null };
    expect((await feed.photoReactors(context().viewer, record().id)).reactors).toHaveLength(1);
    reactorsAnswer = { data: null, error: { message: "Could not find the function public.mw_photo_reactors", code: "PGRST202" } };
    expect(await statusOf(feed.photoReactors(context().viewer, record().id))).toBe(503);
  });
});

describe("deleting, reporting, opening one photo", () => {
  it("lets only the owner delete (audit M2): panitia get 403 for a photo they see, others 404", async () => {
    records.set(record().id, record());
    expect(await statusOf(upload.deletePhoto(context(), record().id))).toBe(403);
    records.set("55555555-5555-4555-8555-555555555555", record({ id: "55555555-5555-4555-8555-555555555555", audience: "kelompok", groupId: "other" }));
    expect(await statusOf(upload.deletePhoto(context(), "55555555-5555-4555-8555-555555555555"))).toBe(404);
    // Panitia remove others' photos through moderation (K08), never through Momen's DELETE.
    const panitia = context({ id: "99999999-9999-4999-8999-999999999999", roles: ["panitia"] });
    expect(await statusOf(upload.deletePhoto(panitia, record().id))).toBe(403);
    expect(await statusOf(upload.deletePhoto(panitia, "55555555-5555-4555-8555-555555555555"))).toBe(404);
    expect(await statusOf(upload.deletePhoto(context({ id: "11111111-1111-4111-8111-111111111111", roles: ["admin"] }), record().id))).toBe(403);
    expect(deleted).toEqual([]);
    expect(removed).toEqual([]);
    // The owner, panitia or not.
    expect(await statusOf(upload.deletePhoto(context({ id: "sari", roles: ["panitia"] }), record().id))).toBe(200);
    expect(deleted).toEqual([record().id]);
    expect(removed).toContain(record().id);
  });

  it("refuses a photo nominated for Awarding with 409 and a plain message (audit M3: 23503), keeping its files", async () => {
    records.set(record().id, record());
    deleteError = { message: "update or delete on table \"mw_photos\" violates foreign key constraint \"mw_award_nominees_photo_id_fkey\"", code: "23503" };
    const refused = await upload.deletePhoto(context({ id: "sari" }), record().id).then(() => null, (error: { status?: number; message?: string }) => error);
    expect(refused).toMatchObject({ status: 409, message: "Foto ini masuk nominasi Awarding, jadi tidak bisa dihapus." });
    expect(upload.NOMINATED_PHOTO).toBe("Foto ini masuk nominasi Awarding, jadi tidak bisa dihapus.");
    expect(removed).toEqual([]);
  });

  it("cleans up an upload cancelled before it was kept, only with the sender's own clientId", async () => {
    const id = storage.photoIdFor(context().viewer.id, start.clientId);
    expect(await statusOf(upload.deletePhoto(context(), id, start.clientId))).toBe(200);
    expect(removed).toContain(id);
    expect(await statusOf(upload.deletePhoto(context({ id: "66666666-6666-4666-8666-666666666666" }), id, start.clientId))).toBe(404);
  });

  it("reports others' photos only, and tells the owner when the third reporter hides it", async () => {
    records.set(record().id, record());
    expect(await feed.reportPhoto(context(), record().id, { reason: "tidak_setuju", note: "" })).toEqual({ hiddenForMe: true });
    expect(await statusOf(feed.reportPhoto(context({ id: "sari" }), record().id, { reason: "tidak_pantas", note: "" }))).toBe(409);
    expect(await statusOf(feed.reportPhoto(context(), "77777777-7777-4777-8777-777777777777", { reason: "tidak_pantas", note: "" }))).toBe(404);
    reportAnswer = { data: [{ reporters: 3, hidden: true, owner_id: "sari" }], error: null };
    const notes = (await import("../notes")).trySendMainWamNote as unknown as ReturnType<typeof vi.fn>;
    notes.mockClear();
    await feed.reportPhoto(context(), record().id, { reason: "tidak_pantas", note: "" });
    expect(notes).toHaveBeenCalledWith(expect.objectContaining({ kind: "momen", photoHidden: true, to: { people: ["sari"], label: "Pemilik foto" } }));
    expect(JSON.stringify(notes.mock.calls[0])).not.toContain(context().viewer.id);
  });

  it("before its migration answers a plain 503, without the migration's name (audit R13)", async () => {
    recordError = { message: "relation \"public.mw_photos\" does not exist", code: "42P01" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refused = await feed.reportPhoto(context(), record().id, { reason: "tidak_pantas", note: "" }).then(() => null, (error: { status?: number; message?: string }) => error);
    expect(refused?.status).toBe(503);
    expect(refused?.message).toBe((await import("../errors")).MW_WAITING_MESSAGE);
    expect(refused?.message).not.toMatch(/2026112|migrasi/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("202611200201"));
    warn.mockRestore();
  });

  it("serves a file to whoever sees the photo and to panitia; others get 404", async () => {
    const hidden = record({ status: "ditinjau", thumbKey: "main-wam/momen/33333333-3333-4333-8333-333333333333-kecil.jpg" });
    records.set(hidden.id, hidden);
    expect(await statusOf(files.photoFileAddress(context(), hidden.id, "kecil"))).toBe(404);
    expect(await files.photoFileAddress(context({ roles: ["panitia"] }), hidden.id, "kecil")).toEqual({ address: expect.stringContaining("-kecil.jpg?get&size=kecil"), cacheSeconds: 3000 });
    expect(files.parsePhotoSize("ubin")).toBe("ubin");
    expect(files.parsePhotoSize("../x")).toBe("besar");
  });

  it("answers a download (Simpan foto) with the large file under a plain name, for whoever sees the photo only", async () => {
    records.set(record().id, record({ thumbKey: "main-wam/momen/33333333-3333-4333-8333-333333333333-kecil.jpg" }));
    expect(await files.photoFileAddress(context(), record().id, "besar", { download: true })).toEqual({ address: expect.stringMatching(/33333333-3333-4333-8333-333333333333\.jpg\?get&size=besar&unduh=wam-2026-33333333\.jpg$/), cacheSeconds: 300 });
    // The access rule is the view's: a hidden photo is a 404 to someone who may not see it, a download does not loosen it.
    const hidden = record({ id: "44444444-4444-4444-8444-444444444444", status: "ditinjau" });
    records.set(hidden.id, hidden);
    expect(await statusOf(files.photoFileAddress(context(), hidden.id, "besar", { download: true }))).toBe(404);
    expect(await statusOf(files.photoFileAddress(context({ roles: ["panitia"] }), hidden.id, "besar", { download: true }))).toBe(200);
  });

  it("tells the viewer who took a photo, in which session and when, for a photo the person sees only", async () => {
    const withSession = record({ sessionId: "00000000-0000-4000-8000-0000000000aa" });
    records.set(withSession.id, withSession);
    expect(await feed.photoDetail(context().viewer, withSession.id)).toEqual({ id: withSession.id, owner: { name: "Sari" }, mine: false, sessionTitle: "Pemaparan departemen", takenAt: withSession.takenAt });
    const own = record({ id: "55555555-5555-4555-8555-555555555555", ownerId: "11111111-1111-4111-8111-111111111111", status: "ditinjau" });
    records.set(own.id, own);
    expect(await feed.photoDetail(context().viewer, own.id)).toMatchObject({ owner: { name: "Rani" }, mine: true, sessionTitle: null });
    // Hidden or reported (someone else's), for another kelompok, and not yet shown: all a plain 404, nothing leaks.
    const hidden = record({ id: "66666666-6666-4666-8666-666666666666", status: "disembunyikan" });
    const later = record({ id: "77777777-7777-4777-8777-777777777777", visibleAt: "2999-01-05T03:00:05Z" });
    const other = record({ id: "88888888-8888-4888-8888-888888888888", audience: "kelompok", groupId: "00000000-0000-4000-8000-0000000000ff" });
    for (const photo of [hidden, later, other]) records.set(photo.id, photo);
    for (const photo of [hidden, later, other]) expect(await statusOf(feed.photoDetail(context().viewer, photo.id)), photo.id).toBe(404);
    expect(await statusOf(feed.photoDetail(context().viewer, "99999999-9999-4999-8999-999999999999"))).toBe(404);
  });

  it("signs a photo without its own small copy or tile with the large file's lifetime", async () => {
    records.set(record().id, record());
    expect(await files.photoFileAddress(context(), record().id, "kecil")).toEqual({ address: expect.stringContaining(".jpg?get&size=besar"), cacheSeconds: 300 });
    expect(await files.photoFileAddress(context(), record().id, "ubin")).toEqual({ address: expect.stringContaining("size=besar"), cacheSeconds: 300 });
  });
});

describe("view addresses per size (audit L5, R3)", () => {
  const at = Date.parse("2027-01-05T03:07:30Z"); // 10.07.30 WIB
  it("besar: one address per 5 minutes, working 15 minutes from its start (so 10 to 15 after handed out)", () => {
    expect(storage.viewWindow("besar", at)).toEqual({ signedAt: Date.parse("2027-01-05T03:05:00Z"), expiresAt: Date.parse("2027-01-05T03:20:00Z") });
    expect(storage.viewWindow("besar", Date.parse("2027-01-05T03:09:59Z")).signedAt).toBe(Date.parse("2027-01-05T03:05:00Z"));
    expect(storage.redirectSeconds("besar")).toBe(300);
  });
  it("kecil stays hourly (the grid's cache), ubin daily from 03.00 WIB (the Mozaik's tiles)", () => {
    expect(storage.viewWindow("kecil", at)).toEqual({ signedAt: Date.parse("2027-01-05T03:00:00Z"), expiresAt: Date.parse("2027-01-05T05:00:00Z") });
    expect(storage.viewWindow("ubin", at)).toEqual({ signedAt: Date.parse("2027-01-04T20:00:00Z"), expiresAt: Date.parse("2027-01-06T20:00:00Z") });
    expect(storage.viewWindow("ubin", Date.parse("2027-01-05T19:59:59Z")).signedAt).toBe(Date.parse("2027-01-04T20:00:00Z"));
    expect(storage.viewWindow("ubin", Date.parse("2027-01-05T20:00:00Z")).signedAt).toBe(Date.parse("2027-01-05T20:00:00Z"));
    expect([storage.redirectSeconds("kecil"), storage.redirectSeconds("ubin")]).toEqual([3000, 3000]);
  });
  it("every address works longer than its redirect may be reused, and within R2's 7 days", () => {
    for (const size of ["besar", "kecil", "ubin"] as const) {
      const { window, valid } = storage.VIEW_POLICY[size];
      expect(valid - window).toBeGreaterThan(storage.redirectSeconds(size) * 1000);
      expect(valid).toBeLessThanOrEqual(7 * 24 * 60 * 60_000);
    }
  });
  it("signs the same address through a window, with the size's lifetime", async () => {
    const real = await vi.importActual<typeof import("./storage")>("./storage");
    const env = { R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "bucket" };
    const before = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]));
    Object.assign(process.env, env);
    try {
      const big = await real.viewAddress("main-wam/momen/a.jpg", "besar", at);
      expect(big).toContain("X-Amz-Expires=900");
      expect(big).toContain("X-Amz-Date=20270105T030500Z");
      expect(await real.viewAddress("main-wam/momen/a.jpg", "besar", at + 2 * 60_000)).toBe(big);
      expect(await real.viewAddress("main-wam/momen/a.jpg", "besar", at + 3 * 60_000)).not.toBe(big);
      expect(await real.viewAddress("main-wam/momen/a-kecil.jpg", "kecil", at)).toContain("X-Amz-Expires=7200");
      expect(await real.viewAddress("main-wam/momen/a-ubin.jpg", "ubin", at)).toMatch(/X-Amz-Date=20270104T200000Z.*X-Amz-Expires=172800|X-Amz-Expires=172800.*X-Amz-Date=20270104T200000Z/);
    } finally {
      for (const [name, value] of Object.entries(before)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    }
  });

  it("the feed gives each photo its reactions (most first, the viewer's marked), dropping what is off the list", async () => {
    const base = { id: record().id, owner_id: "sari", audience: "semua", group_id: null, session_id: null, width: 1, height: 1, taken_at: "", visible_at: "", status: "tampil", file_key: "main-wam/momen/a.jpg", thumb_key: null, seen: false, total: 1 };
    const [photo, bare, odd] = await feed.feedPhotos([
      { ...base, reactions: [{ emoji: HEART, count: 12, mine: true }, { emoji: "😂", count: 3, mine: false }] },
      { ...base, reactions: [] },
      { ...base, reactions: [{ emoji: "🤡", count: 9, mine: false }, { emoji: HEART, count: 0, mine: false }, { emoji: "🔥", count: "2", mine: true }, "x", null] },
    ], context());
    expect(photo.reactions).toEqual([{ emoji: HEART, count: 12, mine: true }, { emoji: "😂", count: 3, mine: false }]);
    expect(bare.reactions).toEqual([]);
    expect(odd.reactions).toEqual([{ emoji: "🔥", count: 2, mine: true }]);
  });

  it("the feed signs the small copy as kecil and the large one as besar", async () => {
    const [photo] = await feed.feedPhotos([{
      id: record().id, owner_id: "sari", audience: "semua", group_id: null, session_id: null, width: 1, height: 1, taken_at: "", visible_at: "", status: "tampil",
      file_key: "main-wam/momen/a.jpg", thumb_key: "main-wam/momen/a-kecil.jpg", reactions: [], seen: false, total: 1,
    }], context());
    expect(photo.src).toEqual({ kecil: "https://r2/main-wam/momen/a-kecil.jpg?get&size=kecil", besar: "https://r2/main-wam/momen/a.jpg?get&size=besar" });
  });
});

describe("the stack holds only photos not seen yet (Momen, tumpukan)", () => {
  const row = (id: string, owner: string, at: string) => ({
    id, owner_id: owner, audience: "semua", group_id: null, session_id: null, width: 1, height: 1, taken_at: at, visible_at: at, status: "tampil",
    file_key: `main-wam/momen/${id}.jpg`, thumb_key: null, reactions: [], seen: false, total: 1,
  });
  const NEW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", OWN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const viewer = context().viewer.id;

  it("asks the database for the stack (the unseen photos only, no second run) and marks one's own photo mine", async () => {
    feedRows = [row(OWN, viewer, "2027-01-05T03:01:00+00:00"), row(NEW, "sari", "2027-01-05T03:02:00.123456+00:00")];
    const page = await feed.listFeed(context(), { view: "semua", session: null, mode: "baru", limit: 20 });
    expect(rpcCalls.find(call => call.name === "mw_photo_feed")?.args).toMatchObject({ p_unseen: true, p_cursor_at: null, p_cursor_rest: null, p_direction: "older" });
    expect(page.items.map(item => [item.id, item.mine, item.seen])).toEqual([[OWN, true, false], [NEW, false, false]]);
    expect(page.next).toBeNull();
  });

  it("the next page's cursor says whether the last photo is the person's own (the own run comes first), and goes back to the database as it came", async () => {
    feedRows = [row(OWN, viewer, "2027-01-05T03:02:00.123456+00:00"), row(NEW, "sari", "2027-01-05T03:02:00.123456+00:00")];
    const own = await feed.listFeed(context(), { view: "semua", session: null, mode: "baru", limit: 1 });
    expect(own.next).toBe(`r~2027-01-05T03:02:00.123456+00:00~${OWN}`);
    feedRows = [row(NEW, "sari", "2027-01-05T03:02:00.123456+00:00"), row(OWN, viewer, "2027-01-05T03:01:00+00:00")];
    const others = await feed.listFeed(context(), { view: "semua", session: null, mode: "baru", limit: 1 });
    expect(others.next).toBe(`b~2027-01-05T03:02:00.123456+00:00~${NEW}`);
    await feed.listFeed(context(), { view: "semua", session: null, mode: "baru", cursor: { at: "2027-01-05T03:02:00.123456+00:00", id: OWN, rest: true }, limit: 20 });
    expect(rpcCalls.at(-1)?.args).toMatchObject({ p_cursor_id: OWN, p_cursor_rest: true });
  });

  it("Beranda counts the others' new photos only (the database's count), and its latest photos are theirs, not the person's own", async () => {
    feedRows = [row(OWN, viewer, "2027-01-05T03:03:00+00:00"), row(NEW, "sari", "2027-01-05T03:02:00+00:00")];
    unseenAnswer = { data: 7, error: null };
    const home = await feed.newForMe(context());
    expect(rpcCalls.find(call => call.name === "mw_photo_unseen_count")?.args).toMatchObject({ p_viewer: viewer });
    expect(home.unseen).toBe(7);
    expect(home.latest.map(item => item.id)).toEqual([NEW]);
  });

  it("with only the person's own unseen photo there is nothing new on Beranda", async () => {
    feedRows = [row(OWN, viewer, "2027-01-05T03:03:00+00:00")];
    unseenAnswer = { data: 0, error: null };
    expect((await feed.newForMe(context())).unseen).toBe(0);
  });

  it("before migration 202611240001 Beranda still counts the others' photos from the page itself", async () => {
    feedRows = [row(OWN, viewer, "2027-01-05T03:03:00+00:00"), row(NEW, "sari", "2027-01-05T03:02:00+00:00")];
    unseenAnswer = { data: null, error: { code: "42883", message: "function mw_photo_unseen_count does not exist" } };
    expect((await feed.newForMe(context())).unseen).toBe(1);
  });
});

describe("the Mozaik's version is worked out before its manifest (audit R3)", () => {
  const mosaicContext = (over: Partial<MainWamContext["viewer"]> = {}): MainWamContext => ({
    viewer: context(over).viewer,
    settings: { groupsPublished: true, modules: { mozaik: true }, moduleConfig: { mozaik: { columns: 10, rows: 6 } }, theme: { images: {} }, event: { name: "WAM 2026" } } as unknown as MainWamContext["settings"],
  });
  const tile = (cell: number, id: string, owner = "sari") => ({ tile: cell, photo_id: id, mw_photos: { owner_id: owner, status: "tampil", tile_key: `main-wam/momen/${id}-ubin.jpg` } });

  it("keeps the version across the hour while the tiles are the same, and changes it with the tiles, the day, the person", async () => {
    const tenAm = new Date("2027-01-05T03:00:00Z"), elevenAm = new Date("2027-01-05T04:10:00Z");
    const first = await mosaic.mosaicHead(mosaicContext(), tenAm);
    expect(first.migrated).toBe(true);
    expect((await mosaic.mosaicHead(mosaicContext(), elevenAm)).version).toBe(first.version);
    versionAnswer = "fingerprint-2";
    expect((await mosaic.mosaicHead(mosaicContext(), elevenAm)).version).not.toBe(first.version);
    versionAnswer = "fingerprint-1";
    // A new day of tile addresses (03.00 WIB): the tiles are signed again, so the version moves once.
    expect((await mosaic.mosaicHead(mosaicContext(), new Date("2027-01-05T20:00:00Z"))).version).not.toBe(first.version);
    expect((await mosaic.mosaicHead(mosaicContext({ id: "22222222-2222-4222-8222-222222222222" }), tenAm)).version).not.toBe(first.version);
    // No presign and no tile query to answer the version.
    expect(rpcCalls.map(call => call.name).filter(name => name === "mw_mosaic_version").length).toBe(5);
    expect(rpcCalls.find(call => call.name === "mw_mosaic_version")?.args).toEqual({ p_total: 60 });
  });

  it("builds the manifest with the version it was given, tiles signed as ubin, mine marked", async () => {
    tileRows = [tile(3, "33333333-3333-4333-8333-333333333333"), tile(7, "44444444-4444-4444-8444-444444444444", context().viewer.id)];
    const manifest = await mosaic.mosaicManifest(mosaicContext(), new Date("2027-01-05T03:00:00Z"), { version: "abc", migrated: true });
    expect(manifest).toMatchObject({ version: "abc", filled: 2, total: 60, people: 2, mine: 1, migrated: true });
    expect(manifest.tiles[1]).toMatchObject({ cell: 7, mine: true, src: "https://r2/main-wam/momen/44444444-4444-4444-8444-444444444444-ubin.jpg?get&size=ubin" });
    expect((await mosaic.mosaicManifest(mosaicContext(), new Date(), { version: "kosong", migrated: false })).migrated).toBe(false);
  });
});
