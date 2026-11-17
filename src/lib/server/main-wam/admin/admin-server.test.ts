import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankSession } from "@/lib/main-wam/admin/rundown";
import { sampleSession } from "@/lib/main-wam/sample";
import { sampleAdminSettings } from "@/lib/main-wam/admin/sample";

/*
 * Agen E's server writers against a stand-in database: what is written where (mw_sessions,
 * mw_rundown_log, the note), the version check, and the database's refusals in plain words.
 */
type Call = { table: string; op: string; args: unknown[]; filters: [string, unknown][] };
const db = vi.hoisted(() => ({
  calls: [] as Call[],
  answer: (() => ({ data: [], error: null })) as (call: Call) => { data: unknown; error: unknown; count?: number },
}));
const notes = vi.hoisted(() => ({ sent: [] as unknown[], recipients: 122 }));

function builder(table: string) {
  const call: Call = { table, op: "select", args: [], filters: [] };
  const chain: Record<string, unknown> = {};
  for (const op of ["insert", "update", "upsert", "delete"]) chain[op] = (...args: unknown[]) => { call.op = op; call.args = args; return chain; };
  chain.select = (...args: unknown[]) => { if (call.op === "select") call.args = args; return chain; };
  for (const name of ["eq", "in", "is", "gt", "lte"]) chain[name] = (column: string, value: unknown) => { call.filters.push([`${name}:${column}`, value]); return chain; };
  for (const name of ["order", "limit", "range", "single", "maybeSingle"]) chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => void) => { db.calls.push(call); resolve(db.answer(call)); };
  return chain;
}
vi.mock("../../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: builder, rpc: (name: string, args: unknown) => (builder(`rpc:${name}`).insert as (value: unknown) => unknown)(args) }) }));
vi.mock("../../admin-session", () => ({ currentAdmin: async () => ({ kind: "person", role: "admin", name: "Admin Contoh", employeeId: "33333333-3333-4333-8333-333333333333" }) }));
vi.mock("../people", () => ({ mainWamPeople: async () => new Map() }));
vi.mock("../notes", () => ({ trySendMainWamNote: async (note: unknown) => { notes.sent.push(note); return notes.recipients; } }));
vi.mock("../settings", () => ({ mainWamSettingsState: async () => sampleAdminSettings(), writeSettingsColumns: async () => sampleAdminSettings() }));
vi.mock("../../config", async importActual => ({ ...(await importActual<object>()), isSupabaseConfigured: () => true }));

const { updateSession, shiftSessions, deleteSession } = await import("./sessions");
const { adminFail, rpcFail } = await import("./common");

const pemaparan = sampleSession("pemaparan");
const row = (session = pemaparan) => ({
  id: session.id, title: session.title, kind: session.kind, status: session.status, starts_at: session.startsAt, ends_at: session.endsAt, place: session.place,
  map_guide_id: null, dresscode: "", bring: "", lineup: [], meal: "", contact_id: null, uses_attendance: true, required: true, optional: false, module: null,
  description: "", sort: 0, changed_at: null, changed_by: null, updated_at: "2026-12-01T00:00:00+00:00",
});

beforeEach(() => {
  db.calls = []; notes.sent = []; notes.recipients = 122;
  db.answer = call => {
    if (call.table === "mw_sessions" && call.op === "select") return { data: [row()], error: null };
    if (call.table === "mw_sessions" && call.op === "update") return { data: [{ id: pemaparan.id }], error: null };
    if (call.table === "mw_rundown_log" && call.op === "insert") return { data: [{ id: "log-1" }], error: null };
    if (call.table === "employees") return { data: [], error: null };
    return { data: [], error: null };
  };
});

describe("updateSession", () => {
  const input = { ...blankSession("2027-01-05"), title: pemaparan.title, start: "08:00", end: "13:00", place: pemaparan.place, status: "terbit" as const, usesAttendance: true, required: true };

  it("logs a published session's new end with who changed it, marks it, and tells participants once", async () => {
    const result = await updateSession(pemaparan.id, input, { notify: true, by: "33333333-3333-4333-8333-333333333333", version: "2026-12-01T00:00:00+00:00" });
    const update = db.calls.find(call => call.table === "mw_sessions" && call.op === "update")!;
    expect(update.args[0]).toMatchObject({ ends_at: "2027-01-05T06:00:00.000Z", changed_by: "33333333-3333-4333-8333-333333333333" });
    expect(update.filters).toEqual([["eq:id", pemaparan.id], ["eq:updated_at", "2026-12-01T00:00:00+00:00"]]);
    const log = db.calls.find(call => call.table === "mw_rundown_log" && call.op === "insert")!;
    expect(log.args[0]).toEqual([{ session_id: pemaparan.id, changes: [{ field: "endsAt", from: pemaparan.endsAt, to: "2027-01-05T06:00:00.000Z" }], changed_by: "33333333-3333-4333-8333-333333333333" }]);
    expect(notes.sent).toEqual([expect.objectContaining({ kind: "jadwal", title: "Jadwal berubah", body: "Pemaparan departemen: 08.00–13.00 (tadinya 08.00–12.00).", tag: `sesi-${pemaparan.id}`, to: { audience: { type: "semua" } } })]);
    expect(db.calls.find(call => call.table === "mw_rundown_log" && call.op === "update")!.args[0]).toEqual({ notified: true, recipients: 122 });
    expect(result.recipients).toBe(122);
  });

  it("does not log or tell anything when only the text changes", async () => {
    await updateSession(pemaparan.id, { ...input, end: "12:00", dresscode: "Batik" }, { notify: true, by: null });
    expect(db.calls.some(call => call.table === "mw_rundown_log")).toBe(false);
    expect(notes.sent).toEqual([]);
  });

  it("refuses to overwrite a change made since the form opened (Rundown live)", async () => {
    const answer = db.answer;
    db.answer = call => (call.table === "mw_sessions" && call.op === "update" ? { data: [], error: null } : answer(call));
    await expect(updateSession(pemaparan.id, input, { notify: false, by: null, version: "2026-11-30T00:00:00+00:00" })).rejects.toMatchObject({ status: 409 });
    expect(db.calls.some(call => call.table === "mw_rundown_log")).toBe(false);
  });

  it("refuses a day outside the event", async () => {
    await expect(updateSession(pemaparan.id, { ...input, date: "2027-01-09" }, { notify: false, by: null })).rejects.toMatchObject({ status: 422 });
  });
});

describe("shiftSessions and deleteSession", () => {
  it("moves sessions in one statement and logs the published ones", async () => {
    const result = await shiftSessions([pemaparan.id], 30, { notify: false, by: null });
    const upsert = db.calls.find(call => call.op === "upsert")!;
    expect(upsert.args[0]).toEqual([expect.objectContaining({ id: pemaparan.id, starts_at: "2027-01-05T01:30:00.000Z", ends_at: "2027-01-05T05:30:00.000Z" })]);
    expect(db.calls.find(call => call.table === "mw_rundown_log")!.args[0]).toEqual([expect.objectContaining({ session_id: pemaparan.id })]);
    expect(notes.sent).toEqual([]);
    expect(result.recipients).toBe(0);
  });

  it("keeps a session with check-ins (cancel it instead)", async () => {
    const answer = db.answer;
    db.answer = call => (call.table === "mw_attendance" ? { data: null, error: null, count: 3 } : answer(call));
    await expect(deleteSession(pemaparan.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/3 absen/) });
    expect(db.calls.some(call => call.op === "delete")).toBe(false);
  });
});

describe("the database's refusals in plain words", () => {
  it("tells its own refusals apart from a missing migration", () => {
    const refused = (error: { code?: string; message?: string }) => { try { adminFail(error, { duplicate: "Nomor kelompok 4 sudah dipakai." }); } catch (problem) { return problem as { status: number; message: string }; } };
    expect(refused({ code: "23505", message: 'duplicate key value violates unique constraint "mw_groups_number_key"' })).toMatchObject({ status: 409, message: "Nomor kelompok 4 sudah dipakai." });
    expect(refused({ code: "23514", message: 'new row for relation "mw_sessions" violates check constraint' })).toMatchObject({ status: 422 });
    expect(refused({ code: "23503", message: 'update or delete on table "mw_groups" violates foreign key constraint on table "mw_photos"' })).toMatchObject({ status: 409 });
    expect(refused({ code: "P0001", message: "MW_DUPLICATE_MEMBER" })).toMatchObject({ status: 409, message: "Satu orang hanya boleh di satu kelompok." });
    expect(refused({ code: "42P01", message: 'relation "public.mw_groups" does not exist' })).toMatchObject({ status: 503, message: expect.stringMatching(/menunggu migrasi 202611200001/) });
    let missing: { status: number; message: string } | undefined;
    try { rpcFail({ code: "PGRST202", message: "Could not find the function public.mw_admin_import_groups" }); } catch (problem) { missing = problem as typeof missing; }
    expect(missing).toMatchObject({ status: 503, message: expect.stringMatching(/202611200501_main_wam_admin/) });
  });
});
