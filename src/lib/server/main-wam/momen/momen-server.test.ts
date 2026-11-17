import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MainWamContext } from "../gate";
import type { PhotoRecord } from "./feed";

/*
 * Area B's server rules, without a database: who may send to Kelompokku, the upload's token, the
 * limits, a photo sent twice kept once, and who may delete, report or open a photo (and who gets 404).
 */

const SECRET = "s".repeat(40);
vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => SECRET }));
vi.mock("../../config", async original => ({ ...(await original<object>()), rateLimitSecret: () => "r".repeat(40) }));

let records = new Map<string, PhotoRecord>();
let counts = { tenMinutes: 0, today: 0 };
let inserted: Record<string, unknown>[] = [];
let deleted: string[] = [];
let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let reportAnswer: { data: unknown; error: { message: string; code?: string } | null } = { data: [{ reporters: 1, hidden: false, owner_id: "sari" }], error: null };
const removed: string[] = [];

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
    // One photo's row by id (feed.ts reads its own photoRecord through here).
    maybeSingle: () => {
      const id = state.filters.find(([column]) => column === "id")?.[1] as string | undefined;
      const found = id ? records.get(id) : undefined;
      return Promise.resolve({ data: found ? {
        id: found.id, owner_id: found.ownerId, audience: found.audience, group_id: found.groupId, session_id: found.sessionId, width: found.width, height: found.height,
        taken_at: found.takenAt, created_at: found.createdAt, visible_at: found.visibleAt, status: found.status, file_key: found.fileKey, thumb_key: found.thumbKey, tile_key: found.tileKey,
      } : null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      inserted.push(row);
      return { select: () => ({ single: () => Promise.resolve({ data: { id: row.id, visible_at: "2027-01-05T08:20:05Z" }, error: null }) }) };
    },
    delete: () => ({ eq: (_column: string, id: string) => { deleted.push(id); return Promise.resolve({ error: null }); } }),
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
      return Promise.resolve({ data: [], error: null });
    },
  }),
}));
vi.mock("../read", () => ({ allSessions: async () => ({ data: [{ id: "00000000-0000-4000-8000-0000000000aa", status: "terbit" }, { id: "00000000-0000-4000-8000-0000000000bb", status: "draf" }], migrated: true }) }));
vi.mock("../notes", () => ({ trySendMainWamNote: vi.fn(async () => 1) }));
vi.mock("../people", () => ({ mainWamPeople: async () => new Map() }));
vi.mock("next/server", () => ({ after: (work: () => unknown) => { void work(); } }));
vi.mock("./storage", async original => {
  const real = await original<typeof import("./storage")>();
  return {
    ...real,
    storageReady: () => true,
    uploadAddresses: async (id: string) => ({ besar: `https://r2/${id}.jpg?put`, kecil: `https://r2/${id}-kecil.jpg?put`, ubin: `https://r2/${id}-ubin.jpg?put` }),
    checkUploaded: async () => undefined,
    removePhotoFiles: async (id: string) => { removed.push(id); },
    viewAddress: async (key: string | null) => (key ? `https://r2/${key}?get` : null),
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

const g4 = { id: "00000000-0000-4000-8000-000000000004", number: 4, name: "Arjuno", coordinator: false, size: 10 };
function context(over: Partial<MainWamContext["viewer"]> = {}): MainWamContext {
  return {
    viewer: { id: "11111111-1111-4111-8111-111111111111", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles: [], tester: false, group: g4, room: null, ...over },
    settings: { groupsPublished: true, modules: { mozaik: true } } as MainWamContext["settings"],
  };
}
const start = { clientId: "22222222-2222-4222-8222-222222222222", audience: "semua" as const, sessionId: null, takenAt: new Date().toISOString(), width: 1280, height: 1600, size: 400_000, thumbSize: 40_000, tileSize: 9_000 };
const record = (over: Partial<PhotoRecord> = {}): PhotoRecord => ({
  id: "33333333-3333-4333-8333-333333333333", ownerId: "sari", audience: "semua", groupId: null, sessionId: null, width: 1280, height: 1600, takenAt: "2026-01-05T03:00:00Z",
  createdAt: "2026-01-05T03:00:00Z", visibleAt: "2026-01-05T03:00:05Z", status: "tampil",
  fileKey: "main-wam/momen/33333333-3333-4333-8333-333333333333.jpg", thumbKey: null, tileKey: null, ...over,
});
const statusOf = (promise: Promise<unknown>) => promise.then(() => 200, (error: { status?: number }) => error.status ?? 500);

beforeEach(() => {
  records = new Map(); counts = { tenMinutes: 0, today: 0 }; inserted = []; deleted = []; rpcCalls = []; removed.length = 0;
  reportAnswer = { data: [{ reporters: 1, hidden: false, owner_id: "sari" }], error: null };
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

  it("refuses Kelompokku before the kelompok is published (409), and over the limits (429)", async () => {
    expect(await statusOf(upload.startUpload(context({ group: null }), { ...start, audience: "kelompok" }))).toBe(409);
    counts = { tenMinutes: 30, today: 30 };
    expect(await statusOf(upload.startUpload(context(), start))).toBe(429);
    counts = { tenMinutes: 0, today: 200 };
    expect(await statusOf(upload.startUpload(context(), start))).toBe(429);
  });

  it("keeps a photo only with its own token; the kelompok and the session come from the server", async () => {
    const begun = await upload.startUpload(context(), { ...start, audience: "kelompok" });
    if (begun.kind !== "unggah") throw new Error("expected an upload");
    expect(await statusOf(upload.confirmUpload(context(), { ...start, audience: "kelompok", token: `${Math.floor(Date.now() / 1000) + 60}.${"0".repeat(64)}` }))).toBe(403);
    // Another person replaying the token: a different photo id, refused.
    expect(await statusOf(upload.confirmUpload(context({ id: "44444444-4444-4444-8444-444444444444" }), { ...start, audience: "kelompok", token: begun.token }))).toBe(403);
    const done = await upload.confirmUpload(context(), { ...start, audience: "kelompok", sessionId: "00000000-0000-4000-8000-0000000000bb", token: begun.token });
    expect(done.id).toBe(begun.id);
    expect(inserted[0]).toMatchObject({ id: begun.id, audience: "kelompok", group_id: g4.id, session_id: null, tile_key: `main-wam/momen/${begun.id}-ubin.jpg` });
  });
});

describe("deleting, reporting, opening one photo", () => {
  it("lets the owner and panitia delete, refuses others (403 when seen, 404 when not)", async () => {
    records.set(record().id, record());
    expect(await statusOf(upload.deletePhoto(context(), record().id))).toBe(403);
    records.set("55555555-5555-4555-8555-555555555555", record({ id: "55555555-5555-4555-8555-555555555555", audience: "kelompok", groupId: "other" }));
    expect(await statusOf(upload.deletePhoto(context(), "55555555-5555-4555-8555-555555555555"))).toBe(404);
    expect(await statusOf(upload.deletePhoto(context({ roles: ["panitia"] }), record().id))).toBe(200);
    expect(deleted).toEqual([record().id]);
    expect(removed).toContain(record().id);
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

  it("serves a file to whoever sees the photo and to panitia; others get 404", async () => {
    const hidden = record({ status: "ditinjau", thumbKey: "main-wam/momen/33333333-3333-4333-8333-333333333333-kecil.jpg" });
    records.set(hidden.id, hidden);
    expect(await statusOf(files.photoFileAddress(context(), hidden.id, "kecil"))).toBe(404);
    expect(await files.photoFileAddress(context({ roles: ["panitia"] }), hidden.id, "kecil")).toContain("-kecil.jpg");
    expect(files.parsePhotoSize("ubin")).toBe("ubin");
    expect(files.parsePhotoSize("../x")).toBe("besar");
  });
});
