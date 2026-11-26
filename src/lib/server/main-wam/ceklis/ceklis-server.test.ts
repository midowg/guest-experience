import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MwSession } from "@/lib/main-wam/types";
import { sampleSession } from "@/lib/main-wam/sample";

/*
 * Ceklis persiapan on the server (agen S1) against a stand-in database: what is read (items; the old
 * column checklist_required is never read, KONTRAK 42), ticking one or all (only the items of that agenda),
 * and the admin's save (ticks kept for an item that keeps its id, a removed item and an unused photo go;
 * nothing is written on the session).
 */
type Call = { table: string; op: string; args: unknown[]; filters: [string, unknown][] };
const db = vi.hoisted(() => ({
  calls: [] as Call[],
  answer: (() => ({ data: [], error: null })) as (call: Call) => { data: unknown; error: unknown },
  removed: [] as string[][],
  sessions: [] as MwSession[],
}));

function builder(table: string) {
  const call: Call = { table, op: "select", args: [], filters: [] };
  const chain: Record<string, unknown> = {};
  for (const op of ["insert", "update", "upsert", "delete"]) chain[op] = (...args: unknown[]) => { call.op = op; call.args = args; return chain; };
  chain.select = () => chain;
  for (const name of ["eq", "in"]) chain[name] = (column: string, value: unknown) => { call.filters.push([`${name}:${column}`, value]); return chain; };
  for (const name of ["order", "limit", "single", "maybeSingle"]) chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => void) => { db.calls.push(call); resolve(db.answer(call)); };
  return chain;
}
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: builder }) }));
vi.mock("../../config", async importActual => ({ ...(await importActual<object>()), isSupabaseConfigured: () => true }));
vi.mock("../../r2", () => ({
  isR2Configured: () => true, removeObjects: async (keys: string[]) => { db.removed.push(keys); },
  presignDownload: async () => "https://r2.example/x", presignUpload: async () => "https://r2.example/up", verifyUpload: async () => "webp",
}));
vi.mock("../read", () => ({ allSessions: async () => ({ data: db.sessions, migrated: true }) }));
vi.mock("../demo", () => ({ demoRundown: async () => false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("react", async importActual => ({ ...(await importActual<object>()), cache: <T,>(fn: T) => fn }));

const { readChecklists, tickChecklist, checklistView } = await import("./data");
const { saveChecklist } = await import("../admin/ceklis");

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PREP = uuid(1), FIRST = uuid(2), ME = uuid(9);
const prep: MwSession = { ...sampleSession("pemaparan"), id: PREP, title: "Persiapan berangkat", startsAt: "2027-01-01T09:00:00+07:00", endsAt: null, usesAttendance: false, required: false };
const first: MwSession = { ...sampleSession("pemaparan"), id: FIRST, title: "Kumpul", startsAt: "2027-01-04T05:30:00+07:00", endsAt: "2027-01-04T06:15:00+07:00", usesAttendance: true };
const itemRow = (n: number, extra: Record<string, unknown> = {}) => ({ id: uuid(100 + n), session_id: PREP, text: `Item ${n}`, note: "", photo_key: null, photo_mime: null, photo_size: null, sort: n, updated_at: "2026-11-25T01:00:00Z", ...extra });
let items: ReturnType<typeof itemRow>[] = [];
let checks: string[] = [];

beforeEach(() => {
  db.calls = []; db.removed = []; db.sessions = [prep, first];
  items = [itemRow(1), itemRow(2), itemRow(3)]; checks = [];
  db.answer = call => {
    if (call.table === "mw_checklist_items" && call.op === "select") {
      const session = call.filters.find(([name]) => name === "eq:session_id");
      return { data: session ? items.filter(item => item.session_id === session[1]) : items, error: null };
    }
    if (call.table === "mw_sessions" && call.op === "select") return { data: { id: PREP }, error: null };
    if (call.table === "mw_checklist_checks" && call.op === "select") return { data: checks.map(item_id => ({ item_id })), error: null };
    return { data: [], error: null };
  };
});

describe("readChecklists", () => {
  it("groups the items by agenda, never asking for the old switch column", async () => {
    const read = await readChecklists();
    expect(read.migrated).toBe(true);
    expect(read.data.get(PREP)).toMatchObject({ items: [{ text: "Item 1" }, { text: "Item 2" }, { text: "Item 3" }] });
    expect(read.data.get(PREP)).not.toHaveProperty("required");
    expect(db.calls.some(call => call.table === "mw_sessions")).toBe(false);
  });
  it("is empty and 'not migrated' before the migration (no table)", async () => {
    db.answer = () => ({ data: null, error: { code: "42P01", message: 'relation "public.mw_checklist_items" does not exist' } });
    const read = await readChecklists();
    expect(read).toMatchObject({ migrated: false });
    expect(read.data.size).toBe(0);
  });
});

describe("the participant's view", () => {
  it("shows items with what the person ticked, never the storage key", async () => {
    items = [itemRow(1, { photo_key: "main-wam/ceklis/00000000-0000-4000-8000-000000000001.webp", photo_mime: "image/webp", photo_size: 900 }), itemRow(2)];
    const read = await readChecklists();
    const view = checklistView(read.data.get(PREP), new Set([uuid(101)]))!;
    expect(view.progress).toEqual({ done: 1, total: 2, complete: false });
    expect(view.items[0]).toMatchObject({ checked: true, photoVersion: String(Date.parse("2026-11-25T01:00:00Z")) });
    expect(JSON.stringify(view)).not.toContain("main-wam/ceklis");
    expect(checklistView(undefined, new Set())).toBeNull();
  });
});

describe("tickChecklist", () => {
  it("ticks one item of that agenda", async () => {
    checks = [uuid(101)];
    const answer = await tickChecklist(ME, PREP, { itemId: uuid(101), checked: true });
    const write = db.calls.find(call => call.table === "mw_checklist_checks" && call.op === "upsert")!;
    expect(write.args[0]).toEqual({ item_id: uuid(101), employee_id: ME });
    expect(answer).toEqual({ checked: [uuid(101)], progress: { done: 1, total: 3, complete: false } });
  });
  it("unticks, and ticks all", async () => {
    await tickChecklist(ME, PREP, { itemId: uuid(101), checked: false });
    expect(db.calls.find(call => call.table === "mw_checklist_checks" && call.op === "delete")!.filters).toEqual([["eq:item_id", uuid(101)], ["eq:employee_id", ME]]);
    checks = [uuid(101), uuid(102), uuid(103)];
    const answer = await tickChecklist(ME, PREP, { all: true });
    expect(db.calls.filter(call => call.op === "upsert").at(-1)!.args[0]).toHaveLength(3);
    expect(answer.progress.complete).toBe(true);
  });
  it("refuses an item of another agenda, a draft or unknown agenda", async () => {
    await expect(tickChecklist(ME, PREP, { itemId: uuid(500), checked: true })).rejects.toMatchObject({ status: 404 });
    db.sessions = [{ ...prep, status: "draf" }];
    await expect(tickChecklist(ME, PREP, { all: true })).rejects.toMatchObject({ status: 404 });
    await expect(tickChecklist(ME, uuid(77), { all: true })).rejects.toMatchObject({ status: 404 });
  });
});

describe("saveChecklist (admin)", () => {
  const input = { items: [{ id: uuid(101), text: "Jaket tebal", note: "Malam dingin", photo: null }, { text: "Tumbler", note: "", photo: null }] };

  it("keeps an item with its id, adds a new one, removes the one left out, and writes nothing on the session", async () => {
    await saveChecklist(PREP, input);
    const removed = db.calls.find(call => call.table === "mw_checklist_items" && call.op === "delete")!;
    expect(removed.filters).toEqual([["in:id", [uuid(102), uuid(103)]]]);
    const upsert = db.calls.find(call => call.table === "mw_checklist_items" && call.op === "upsert")!;
    const rows = upsert.args[0] as Record<string, unknown>[];
    expect(rows.map(row => [row.text, row.sort])).toEqual([["Jaket tebal", 0], ["Tumbler", 1]]);
    expect(rows[0].id).toBe(uuid(101));
    expect(rows[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows.every(row => row.session_id === PREP)).toBe(true);
    expect(db.calls.some(call => call.table === "mw_sessions" && call.op !== "select")).toBe(false);
  });
  it("saves before it removes, and removes nothing when the save fails (ticks of kept items are safe)", async () => {
    await saveChecklist(PREP, input);
    const order = db.calls.filter(call => call.table === "mw_checklist_items" && (call.op === "upsert" || call.op === "delete")).map(call => call.op);
    expect(order).toEqual(["upsert", "delete"]);
    db.calls.length = 0;
    db.answer = (base => (call: Call) => (call.table === "mw_checklist_items" && call.op === "upsert" ? { data: null, error: { code: "XX000", message: "boom" } } : base(call)))(db.answer);
    await expect(saveChecklist(PREP, input)).rejects.toBeDefined();
    expect(db.calls.some(call => call.op === "delete")).toBe(false);
  });
  it("refuses an id that is not this agenda's", async () => {
    await expect(saveChecklist(PREP, { ...input, items: [{ id: uuid(999), text: "Asing", note: "", photo: null }] })).rejects.toMatchObject({ status: 409 });
    expect(db.calls.some(call => call.op === "upsert" || call.op === "delete")).toBe(false);
  });
  it("removes the photo of an item that is gone or replaced, from storage", async () => {
    const oldKey = "main-wam/ceklis/00000000-0000-4000-8000-0000000000a1.webp";
    const newKey = "main-wam/ceklis/00000000-0000-4000-8000-0000000000b2.webp";
    items = [itemRow(1, { photo_key: oldKey, photo_mime: "image/webp", photo_size: 100 }), itemRow(2, { photo_key: "main-wam/ceklis/00000000-0000-4000-8000-0000000000c3.png", photo_mime: "image/png", photo_size: 100 })];
    db.answer = (base => (call: Call) => (call.table === "mw_checklist_items" && call.op === "select" && call.filters.some(([name]) => name === "in:photo_key") ? { data: [], error: null } : base(call)))(db.answer);
    await saveChecklist(PREP, { items: [{ id: uuid(101), text: "Jaket", note: "", photo: { key: newKey, mime: "image/webp", size: 200 } }] });
    expect(db.removed.flat().sort()).toEqual([oldKey, "main-wam/ceklis/00000000-0000-4000-8000-0000000000c3.png"].sort());
  });
});
