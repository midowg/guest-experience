import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MainWamContext } from "../gate";

/*
 * Galeri, Ditandai on the server without a database: it reads the person's tags, then those photos, and keeps what Momen lets
 * them see; before the tags table exists it is an empty list, not an error.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const SARI = "22222222-2222-4222-8222-222222222222";
const DIMAS = "33333333-3333-4333-8333-333333333333";
const GROUP = "99999999-9999-4999-8999-999999999999";
const uid = (n: number) => `00000000-0000-4000-8c00-${String(n).padStart(12, "0")}`;
const NOW = new Date("2027-01-05T08:00:00Z");

const state = vi.hoisted(() => ({
  tables: {} as Record<string, { data?: unknown[]; error?: { code?: string; message?: string } | null }>,
  calls: [] as { table: string; ops: [string, unknown[]][] }[],
  tagsOf: new Map<string, { id: string; name: string }[]>(),
}));
function chain(table: string) {
  const call = { table, ops: [] as [string, unknown[]][] };
  state.calls.push(call);
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
          const answer = state.tables[table] ?? { data: [] };
          // A photo read honours its .in(): only the ids asked for.
          const asked = call.ops.find(([name, args]) => name === "in" && args[0] === "id")?.[1][1] as string[] | undefined;
          const data = (answer.data ?? []).filter(row => !asked || asked.includes((row as { id: string }).id));
          return Promise.resolve({ data, error: answer.error ?? null }).then(resolve, reject);
        };
      }
      return (...args: unknown[]) => { call.ops.push([String(prop), args]); return proxy; };
    },
  });
  return proxy;
}
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: chain }) }));
vi.mock("./feed", () => ({
  feedPhotos: async (rows: { id: string; owner_id: string; visible_at: string }[]) => rows.map(row => ({ id: row.id, owner: { id: row.owner_id, name: row.owner_id === SARI ? "Sari" : "Dimas", photo: null }, visibleAt: row.visible_at, mine: false })),
}));
vi.mock("../misi/tags", () => ({ tagsOfPhotos: async () => state.tagsOf }));

const { listTagged } = await import("./tagged");
const context = { viewer: { id: ME, roles: [], group: { id: GROUP } } } as unknown as MainWamContext;
const photo = (n: number, over: Record<string, unknown> = {}) => ({
  id: uid(n), owner_id: SARI, audience: "semua", group_id: null, session_id: null, width: 1, height: 1, taken_at: "2027-01-05T07:00:00Z",
  visible_at: new Date(NOW.getTime() - n * 60_000).toISOString(), status: "tampil", file_key: "k", thumb_key: null, ...over,
});

beforeEach(() => {
  state.calls = []; state.tagsOf = new Map();
  state.tables = {
    mw_photo_tags: { data: [1, 2, 3, 4].map(n => ({ photo_id: uid(n), created_at: "2027-01-05T07:30:00Z" })) },
    mw_photos: { data: [photo(1), photo(2, { status: "disembunyikan" }), photo(3, { owner_id: DIMAS }), photo(4, { visible_at: new Date(NOW.getTime() + 60_000).toISOString() })] },
    mw_photo_reports: { data: [] },
  };
});

describe("listTagged", () => {
  it("reads only the person's active tags, then their photos, newest first, with the others tagged on each", async () => {
    state.tagsOf = new Map([[uid(1), [{ id: ME, name: "Rani" }, { id: SARI, name: "Sari" }, { id: DIMAS, name: "Dimas" }]]]);
    const answer = await listTagged(context, { now: NOW });
    expect(answer).toMatchObject({ next: null, total: 2, migrated: true });
    expect(answer.items.map(item => item.id)).toEqual([uid(1), uid(3)]);
    // Never the person (they are the reader) and never the owner of the photo.
    expect(answer.items[0].withNames).toEqual(["Dimas"]);
    expect(answer.items[1].withNames).toEqual([]);
    const tagRead = state.calls.find(call => call.table === "mw_photo_tags")!;
    expect(tagRead.ops).toContainEqual(["eq", ["employee_id", ME]]);
    expect(tagRead.ops).toContainEqual(["is", ["removed_at", null]]);
    const photoRead = state.calls.find(call => call.table === "mw_photos")!;
    expect(photoRead.ops).toContainEqual(["eq", ["status", "tampil"]]);
    expect(photoRead.ops).toContainEqual(["neq", ["owner_id", ME]]);
  });

  it("leaves out a photo the person reported", async () => {
    state.tables.mw_photo_reports = { data: [{ photo_id: uid(1) }] };
    expect((await listTagged(context, { now: NOW })).items.map(item => item.id)).toEqual([uid(3)]);
  });

  it("a person nobody tagged: empty, migrated, and the photos are not even read", async () => {
    state.tables.mw_photo_tags = { data: [] };
    expect(await listTagged(context, { now: NOW })).toEqual({ items: [], next: null, total: 0, migrated: true });
    expect(state.calls.some(call => call.table === "mw_photos")).toBe(false);
  });

  it("works without the migration: the tags table is missing, so the list is empty and not migrated (no error)", async () => {
    state.tables.mw_photo_tags = { error: { code: "42P01", message: 'relation "public.mw_photo_tags" does not exist' } };
    expect(await listTagged(context, { now: NOW })).toEqual({ items: [], next: null, total: 0, migrated: false });
  });

  it("pages of 30: a first page with a cursor, the rest after it, the total only on the first", async () => {
    state.tables.mw_photo_tags = { data: Array.from({ length: 45 }, (_, index) => ({ photo_id: uid(index + 1), created_at: "x" })) };
    state.tables.mw_photos = { data: Array.from({ length: 45 }, (_, index) => photo(index + 1)) };
    const first = await listTagged(context, { now: NOW });
    expect(first.items).toHaveLength(30);
    expect(first.total).toBe(45);
    expect(first.next).toMatch(/^t~/);
    const { decodeTaggedCursor } = await import("@/lib/main-wam/momen/tagged");
    const second = await listTagged(context, { now: NOW, cursor: decodeTaggedCursor(first.next) as never });
    expect(second.items).toHaveLength(15);
    expect(second.next).toBeNull();
    expect(second.total).toBeNull();
  });
});
