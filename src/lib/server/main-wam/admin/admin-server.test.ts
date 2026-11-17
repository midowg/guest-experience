import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankSession } from "@/lib/main-wam/admin/rundown";
import { sampleSession } from "@/lib/main-wam/sample";
import { sampleAdminSettings } from "@/lib/main-wam/admin/sample";

/*
 * Agen E's server writers against a stand-in database: what is written where (mw_sessions,
 * mw_rundown_log, the note), the version check, Hapus only for a session without absen, photos,
 * Silent Meeting or Awarding (audit M4), Geser jam by version (S7), the QR token made when a session
 * is saved with absen (R15), and the database's refusals in plain words without system words (T-A01).
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

const { adminSessions, copySession, createSession, updateSession, shiftSessions, deleteSession } = await import("./sessions");
const { adminFail, rpcFail, WAITING_MESSAGE } = await import("./common");

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

describe("the QR token of a session with absen (audit R15)", () => {
  const input = { ...blankSession("2027-01-05"), title: pemaparan.title, start: "08:00", end: "12:00", place: pemaparan.place, status: "terbit" as const };
  const TOKEN = /^[A-Za-z0-9_-]{24}$/;
  const tokenUpdate = () => db.calls.find(call => call.table === "mw_sessions" && call.op === "update" && "qr_token" in (call.args[0] as object));

  it("is made when a session is saved with Pakai absen and has none yet (an existing one is kept by the filter)", async () => {
    await updateSession(pemaparan.id, { ...input, usesAttendance: true }, { notify: false, by: null });
    const update = tokenUpdate()!;
    expect((update.args[0] as { qr_token: string }).qr_token).toMatch(TOKEN);
    expect(update.filters).toEqual([["eq:id", pemaparan.id], ["is:qr_token", null]]);
    // The save itself never writes the token: switching absen off later keeps it.
    const save = db.calls.find(call => call.table === "mw_sessions" && call.op === "update")!;
    expect(save.args[0]).not.toHaveProperty("qr_token");
  });

  it("is not touched when absen is off", async () => {
    await updateSession(pemaparan.id, { ...input, usesAttendance: false, required: false }, { notify: false, by: null });
    expect(tokenUpdate()).toBeUndefined();
  });

  it("comes with a new session or a copy that uses absen, each its own", async () => {
    await createSession({ ...input, usesAttendance: true });
    await createSession({ ...input, title: "Tanpa absen", usesAttendance: false });
    await copySession(pemaparan.id, null);
    const inserts = db.calls.filter(call => call.table === "mw_sessions" && call.op === "insert").map(call => call.args[0] as Record<string, unknown>);
    expect(inserts[0].qr_token).toMatch(TOKEN);
    expect(inserts[1]).not.toHaveProperty("qr_token");
    expect(inserts[2].qr_token).toMatch(TOKEN);
    expect(inserts[2].qr_token).not.toBe(inserts[0].qr_token);
  });
});

describe("Geser jam by version (audit S7)", () => {
  const version = "2026-12-01T00:00:00+00:00";

  it("moves the sessions in the database's one step with each version, then logs the published ones", async () => {
    const result = await shiftSessions([{ id: pemaparan.id, version }], 30, { notify: false, by: null });
    const rpc = db.calls.find(call => call.table === "rpc:mw_admin_shift_sessions")!;
    expect(rpc.args[0]).toEqual({ p_items: [{ id: pemaparan.id, version }], p_minutes: 30, p_by: null });
    expect(db.calls.some(call => call.op === "upsert")).toBe(false);
    expect(db.calls.find(call => call.table === "mw_rundown_log")!.args[0]).toEqual([expect.objectContaining({
      session_id: pemaparan.id, changes: [{ field: "startsAt", from: pemaparan.startsAt, to: "2027-01-05T01:30:00.000Z" }, { field: "endsAt", from: pemaparan.endsAt, to: "2027-01-05T05:30:00.000Z" }],
    })]);
    expect(notes.sent).toEqual([]);
    expect(result.recipients).toBe(0);
  });

  it("refuses an old version (changed in Rundown live since the page loaded) without moving anything", async () => {
    await expect(shiftSessions([{ id: pemaparan.id, version: "2026-11-30T00:00:00+00:00" }], 30, { notify: true, by: null }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/^Pemaparan departemen baru saja diubah orang lain .*tidak ada yang digeser/) });
    expect(db.calls.some(call => call.table === "rpc:mw_admin_shift_sessions" || call.op === "upsert" || call.table === "mw_rundown_log")).toBe(false);
    expect(notes.sent).toEqual([]);
  });

  it("refuses when the database finds a newer version under its lock", async () => {
    const answer = db.answer;
    db.answer = call => (call.table === "rpc:mw_admin_shift_sessions" ? { data: null, error: { code: "P0001", message: "MW_SESSION_CHANGED", details: pemaparan.id } } : answer(call));
    await expect(shiftSessions([{ id: pemaparan.id, version }], 15, { notify: true, by: null })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/^Pemaparan departemen baru saja/) });
    expect(db.calls.some(call => call.table === "mw_rundown_log")).toBe(false);
  });

  it("before E's migration: compares the versions, then moves them in one statement", async () => {
    const answer = db.answer;
    db.answer = call => (call.table === "rpc:mw_admin_shift_sessions" ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } } : answer(call));
    await shiftSessions([{ id: pemaparan.id, version }], 30, { notify: false, by: null });
    const upsert = db.calls.find(call => call.op === "upsert")!;
    expect(upsert.args[0]).toEqual([expect.objectContaining({ id: pemaparan.id, starts_at: "2027-01-05T01:30:00.000Z", ends_at: "2027-01-05T05:30:00.000Z" })]);
  });
});

describe("Hapus sesi (audit M4)", () => {
  const inUse = (usage: Record<string, unknown>) => (call: Call) => {
    if (call.table === "rpc:mw_admin_delete_session") return { data: null, error: { code: "P0001", message: "MW_SESSION_IN_USE" } };
    if (call.table === "rpc:mw_admin_session_usage") return { data: [{ session_id: pemaparan.id, attendance: 0, photos: 0, silent: false, awards: 0, activity_groups: 0, ...usage }], error: null };
    return { data: [row()], error: null };
  };

  it("deletes through the database's checked step", async () => {
    await deleteSession(pemaparan.id);
    expect(db.calls.find(call => call.table === "rpc:mw_admin_delete_session")!.args[0]).toEqual({ p_session: pemaparan.id });
    expect(db.calls.some(call => call.op === "delete")).toBe(false);
  });

  it("refuses a session with absen and photos, saying what it has and to cancel it", async () => {
    db.answer = inUse({ attendance: 96, photos: 12 });
    await expect(deleteSession(pemaparan.id)).rejects.toMatchObject({ status: 409, message: "Sesi ini sudah punya 96 absen dan 12 foto Momen. Pakai Batalkan." });
  });

  it("refuses a session with a Silent Meeting question or Awarding (no feedback count is read)", async () => {
    db.answer = inUse({ silent: true, awards: 2 });
    await expect(deleteSession(pemaparan.id)).rejects.toMatchObject({ status: 409, message: "Sesi ini sudah punya pertanyaan Silent Meeting dan 2 kategori Awarding. Pakai Batalkan." });
  });

  it("before E's migration: counts absen first, and turns the database's own refusal (23503) into Pakai Batalkan", async () => {
    const missing = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    db.answer = call => (call.table === "rpc:mw_admin_delete_session" ? missing : call.table === "mw_attendance" ? { data: null, error: null, count: 3 } : { data: [row()], error: null, count: 0 });
    await expect(deleteSession(pemaparan.id)).rejects.toMatchObject({ status: 409, message: "Sesi ini sudah punya 3 absen. Pakai Batalkan." });
    expect(db.calls.some(call => call.op === "delete")).toBe(false);
    db.answer = call => (call.table === "rpc:mw_admin_delete_session" ? missing
      : call.op === "delete" ? { data: null, error: { code: "23503", message: 'update or delete on table "mw_sessions" violates foreign key constraint on table "mw_silent_questions"' } }
      : { data: [row()], error: null, count: 0 });
    await expect(deleteSession(pemaparan.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Pakai Batalkan\.$/) });
  });

  it("gives the page what each session has, so Hapus can be turned off beforehand", async () => {
    db.answer = inUse({ attendance: 5 });
    const { data } = await adminSessions();
    expect(data[0]).toMatchObject({ id: pemaparan.id, version: "2026-12-01T00:00:00+00:00", usage: { attendance: 5, photos: 0, silent: false, awards: 0, activityGroups: 0 } });
    db.answer = call => (call.table.startsWith("rpc:") ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } } : { data: [row()], error: null });
    expect((await adminSessions()).data[0].usage).toBeNull();
  });
});

describe("the database's refusals in plain words (audit T-A01)", () => {
  it("tells its own refusals apart from a missing migration, never naming files or systems", () => {
    const refused = (error: { code?: string; message?: string }) => { try { adminFail(error, { duplicate: "Nomor kelompok 4 sudah dipakai." }); } catch (problem) { return problem as { status: number; message: string }; } };
    expect(refused({ code: "23505", message: 'duplicate key value violates unique constraint "mw_groups_number_key"' })).toMatchObject({ status: 409, message: "Nomor kelompok 4 sudah dipakai." });
    expect(refused({ code: "23514", message: 'new row for relation "mw_sessions" violates check constraint' })).toMatchObject({ status: 422 });
    expect(refused({ code: "23503", message: 'update or delete on table "mw_groups" violates foreign key constraint on table "mw_photos"' })).toMatchObject({ status: 409 });
    expect(refused({ code: "P0001", message: "MW_DUPLICATE_MEMBER" })).toMatchObject({ status: 409, message: "Satu orang hanya boleh di satu kelompok." });
    expect(refused({ code: "42P01", message: 'relation "public.mw_groups" does not exist' })).toMatchObject({ status: 503, message: WAITING_MESSAGE });
    expect(WAITING_MESSAGE).toBe("Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.");
    let missing: { status: number; message: string } | undefined;
    try { rpcFail({ code: "PGRST202", message: "Could not find the function public.mw_admin_import_groups" }); } catch (problem) { missing = problem as typeof missing; }
    expect(missing).toMatchObject({ status: 503, message: WAITING_MESSAGE });
    const other = refused({ code: "08006", message: "connection failure" })!;
    expect(other.status).toBe(503);
    for (const message of [other.message, WAITING_MESSAGE]) expect(message).not.toMatch(/migrasi|\.sql|\d{6}|R2|database|Supabase|server/i);
  });
});
