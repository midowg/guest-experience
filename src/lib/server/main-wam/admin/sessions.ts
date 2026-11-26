import "server-only";
import { randomBytes } from "node:crypto";
import {
  changeNote, deleteRefusal, IN_USE_REFUSAL, scheduleChanges, sessionRow, shiftConflict, shifted, shiftNote, type AdminSession, type SessionInput, type SessionUsage,
} from "@/lib/main-wam/admin/rundown";
import { SESSION_COLUMNS, sessionFromRow } from "@/lib/main-wam/rows";
import { byStart, eventDates, eventDay, isSessionDate, PREP_WINDOW_DAYS, wibDate } from "@/lib/main-wam/rundown";
import type { RundownChange } from "@/lib/main-wam/types";
import { newQrToken } from "@/lib/pra-wam/attendance";
import { mainWamPath } from "@/lib/routes";
import { isSupabaseConfigured, ServiceError } from "../../config";
import { mwMissing, type Read } from "../errors";
import { trySendMainWamNote } from "../notes";
import { mainWamSettingsState } from "../settings";
import { adminChecklists } from "./ceklis";
import { adminFail, adminWaiting, assertPeople, db, functionMissing } from "./common";

/*
 * Admin WAM → Main WAM → Rundown (agen E): mw_sessions as the admin manages them, drafts included.
 * A change to a published session's time, place or status is logged (mw_rundown_log, "diubah
 * oleh") and the session is marked changed; with "Kabari peserta" the participants get one note
 * (tag sesi-<id>, so the latest replaces the one before). Every answer is the whole rundown again,
 * so the page swaps its list without reloading, with what each session already has (Hapus only
 * where nothing people made would be lost; otherwise Batalkan, audit M4).
 */

const refusals = { invalid: "Isian sesi belum sesuai aturan (jam selesai setelah mulai, makan tanpa absen, wajib dengan absen).", inUse: "Denah atau kontak panitia sudah tidak ada. Pilih lagi." };

/** A session that uses absen gets its QR token when it is saved (audit R15; Pra WAM's newQrToken). */
const qrToken = () => newQrToken(size => randomBytes(size));

type UsageRow = { session_id: string; attendance: number; photos: number; silent: boolean; awards: number; activity_groups: number };
/**
 * What each session already has (mw_admin_session_usage, one statement). Null when it cannot be
 * read (E's migration not run yet, or the database did not answer): the page then offers Hapus and
 * the server checks when it is pressed.
 */
async function usageOf(ids?: readonly string[]): Promise<Map<string, SessionUsage> | null> {
  const { data, error } = await db().rpc("mw_admin_session_usage", ids ? { p_sessions: ids } : {});
  if (error) return null;
  return new Map(((data ?? []) as UsageRow[]).map(row => [row.session_id, {
    attendance: row.attendance, photos: row.photos, silent: row.silent, awards: row.awards, activityGroups: row.activity_groups,
  }]));
}

/**
 * Every session with its row version and what it has, fresh (not the per-request cache: the answer
 * follows a write). `usage: false` for pages that only list sessions (Kelompok, Perjalanan).
 */
export async function adminSessions({ usage: withUsage = true }: { usage?: boolean } = {}): Promise<Read<AdminSession[]>> {
  if (!isSupabaseConfigured()) return { data: [], migrated: false };
  const [{ data, error }, usage, checklists] = await Promise.all([
    db().from("mw_sessions").select(`${SESSION_COLUMNS},updated_at`).order("starts_at").order("sort").limit(500),
    withUsage ? usageOf() : null,
    // Only the Rundown page edits checklists; a failed read leaves them out (null), never the rundown.
    withUsage ? adminChecklists().catch(() => null) : null,
  ]);
  if (error) { if (mwMissing(error)) return { data: [], migrated: false }; adminFail(error); }
  return {
    data: ((data ?? []) as Record<string, unknown>[]).map(row => {
      const session = sessionFromRow(row);
      const base = { ...session, version: typeof row.updated_at === "string" ? row.updated_at : null, usage: usage?.get(session.id) ?? null };
      return withUsage ? { ...base, checklist: checklists ? checklists.get(session.id) ?? { items: [] } : null } : base;
    }).sort(byStart),
    migrated: true,
  };
}
async function sessionsOrWait(): Promise<AdminSession[]> {
  const { data, migrated } = await adminSessions();
  if (!migrated) throw adminWaiting();
  return data;
}

/** The day is one of the event's, and the guide and contact exist. */
async function checkInputs(inputs: readonly SessionInput[]): Promise<void> {
  const settings = await mainWamSettingsState();
  if (!settings.migrated) throw adminWaiting();
  const dates = eventDates(settings.event);
  // A day of the event, or a Persiapan day before it ("H-3", up to PREP_WINDOW_DAYS before the first day).
  const outside = inputs.find(input => !isSessionDate(input.date, settings.event));
  if (outside) throw new ServiceError(422, `Hari ${outside.date} di luar tanggal acara (${dates[0]} sampai ${dates.at(-1)}) dan di luar masa persiapan (${PREP_WINDOW_DAYS} hari sebelumnya).`, { date: ["Pilih hari acara atau hari persiapan."] });
  const guides = [...new Set(inputs.map(input => input.mapGuideId).filter((id): id is string => !!id))];
  if (guides.length) {
    const { data, error } = await db().from("mw_guides").select("id").in("id", guides);
    if (error) adminFail(error);
    if ((data ?? []).length !== guides.length) throw new ServiceError(422, "Denah yang dipilih sudah tidak ada. Pilih lagi.", { mapGuideId: ["Pilih denah lagi."] });
  }
  await assertPeople(inputs.map(input => input.contactId));
}

/** A new session's row, with its QR token when it uses absen. */
function newRow(input: SessionInput): Record<string, unknown> {
  const row = sessionRow(input);
  return row.uses_attendance ? { ...row, qr_token: qrToken() } : row;
}

export async function createSession(input: SessionInput): Promise<{ sessions: AdminSession[]; id: string }> {
  await checkInputs([input]);
  const { data, error } = await db().from("mw_sessions").insert(newRow(input)).select("id").single();
  if (error) adminFail(error, refusals);
  return { sessions: await sessionsOrWait(), id: data.id as string };
}

/** Many sessions from a pasted sheet, in one statement (all or nothing). */
export async function importSessions(inputs: readonly SessionInput[]): Promise<{ sessions: AdminSession[]; added: number }> {
  await checkInputs(inputs);
  const { error } = await db().from("mw_sessions").insert(inputs.map(newRow));
  if (error) adminFail(error, refusals);
  return { sessions: await sessionsOrWait(), added: inputs.length };
}

/**
 * A session saved with "Pakai absen" gets a QR token if it has none yet (audit R15): the QR that
 * panitia print is ready without anything written when it is only looked at. An existing token is
 * kept (printed sheets keep working), and switching absen off keeps it too.
 */
async function ensureQrToken(id: string): Promise<void> {
  const { error } = await db().from("mw_sessions").update({ qr_token: qrToken() }).eq("id", id).is("qr_token", null);
  if (error) adminFail(error, refusals);
}

type Told = { notified: boolean; recipients: number };
const NOBODY: Told = { notified: false, recipients: 0 };

/** Writes the log entries and, when asked, tells participants; how many got the note. */
async function logAndTell(entries: { session: AdminSession; changes: RundownChange["changes"] }[], by: string | null, note: { title: string; body: string; link: string; tag?: string } | null): Promise<Told> {
  if (!entries.length) return NOBODY;
  const { data, error } = await db().from("mw_rundown_log")
    .insert(entries.map(entry => ({ session_id: entry.session.id, changes: entry.changes, changed_by: by })))
    .select("id");
  if (error) adminFail(error);
  if (!note) return NOBODY;
  const recipients = await trySendMainWamNote({ kind: "jadwal", title: note.title, body: note.body, to: { audience: { type: "semua" } }, link: note.link, by, tag: note.tag });
  if (recipients > 0) {
    await db().from("mw_rundown_log").update({ notified: true, recipients }).in("id", (data ?? []).map(row => row.id as string));
  }
  return { notified: recipients > 0, recipients };
}

/**
 * Saves a session. A published (or cancelled) session whose time, place or status changes is
 * logged and marked "diubah" (the same mw_rundown_log and changed_at/by that Rundown live writes);
 * `notify` tells participants (only when they could see it). With `version`, a session changed
 * since the form opened (Rundown live, another admin) is not overwritten: 409.
 */
export async function updateSession(id: string, input: SessionInput, options: { notify: boolean; by: string | null; version?: string | null }): Promise<{ sessions: AdminSession[] } & Told> {
  const all = await sessionsOrWait();
  const before = all.find(session => session.id === id);
  if (!before) throw new ServiceError(404, "Sesi tidak ditemukan. Muat ulang halaman.");
  await checkInputs([input]);
  const row = sessionRow(input);
  const after = { ...before, title: input.title, startsAt: row.starts_at as string, endsAt: row.ends_at as string | null, place: input.place, status: input.status };
  const changes = scheduleChanges(before, after);
  const now = new Date().toISOString();
  let query = db().from("mw_sessions").update({ ...row, updated_at: now, ...(changes.length ? { changed_at: now, changed_by: options.by } : {}) }).eq("id", id);
  if (options.version) query = query.eq("updated_at", options.version);
  const { data: saved, error } = await query.select("id");
  if (error) adminFail(error, refusals);
  if (!saved?.length) throw new ServiceError(409, "Sesi ini baru saja diubah orang lain (mungkin lewat Rundown live). Tutup lalu buka lagi untuk melihat yang terbaru.");
  if (row.uses_attendance) await ensureQrToken(id);
  const seen = before.status !== "draf";
  const told = await logAndTell(changes.length ? [{ session: before, changes }] : [], options.by,
    options.notify && seen && changes.length ? { ...changeNote(before, after), link: mainWamPath.session(id), tag: `sesi-${id}` } : null);
  return { sessions: await sessionsOrWait(), ...told };
}

/** A copy on the same or another day, as a draft (the admin publishes it when it is right). */
export async function copySession(id: string, date: string | null): Promise<{ sessions: AdminSession[]; id: string }> {
  const all = await sessionsOrWait();
  const source = all.find(session => session.id === id);
  if (!source) throw new ServiceError(404, "Sesi tidak ditemukan. Muat ulang halaman.");
  const settings = await mainWamSettingsState();
  const from = wibDate(source.startsAt);
  const to = date ?? from;
  if (!isSessionDate(to, settings.event)) throw new ServiceError(422, "Pilih hari acara atau hari persiapan.", { date: ["Pilih hari acara atau hari persiapan."] });
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  const moved = shifted(source, days * 24 * 60);
  const { data, error } = await db().from("mw_sessions").insert({
    title: source.title, kind: source.kind, status: "draf", starts_at: moved.startsAt, ends_at: moved.endsAt, place: source.place, map_guide_id: source.mapGuideId,
    dresscode: source.dresscode, bring: source.bring, lineup: source.lineup, meal: source.meal, contact_id: source.contactId, uses_attendance: source.usesAttendance,
    required: source.required, optional: source.optional, module: source.module, description: source.description, sort: source.sort + 1,
    // Its own token: the copy is another session, its QR another sheet.
    ...(source.usesAttendance ? { qr_token: qrToken() } : {}),
  }).select("id").single();
  if (error) adminFail(error, refusals);
  return { sessions: await sessionsOrWait(), id: data.id as string };
}

/**
 * Moves sessions by some minutes, all or nothing, each only from the version the admin saw (audit
 * S7, like a single save): one changed since, in Rundown live or by another admin, is not moved
 * from its old time; nothing is (409). Published ones are logged; `notify` sends one note for all.
 */
export async function shiftSessions(items: readonly { id: string; version: string }[], minutes: number, options: { notify: boolean; by: string | null }): Promise<{ sessions: AdminSession[] } & Told> {
  const all = await sessionsOrWait();
  const byId = new Map(all.map(session => [session.id, session]));
  const picked = items.map(item => byId.get(item.id));
  if (picked.some(session => !session)) throw new ServiceError(404, "Ada sesi yang sudah tidak ada. Muat ulang halaman.");
  // Checked here first (the title in the answer), then again under lock by the database.
  const stale = items.find(item => byId.get(item.id)!.version !== item.version);
  if (stale) throw new ServiceError(409, shiftConflict(byId.get(stale.id)!.title));
  const moved = (picked as AdminSession[]).map(session => ({ before: session, after: shifted(session, minutes) }));
  const { error } = await db().rpc("mw_admin_shift_sessions", { p_items: items, p_minutes: minutes, p_by: options.by });
  if (error) {
    if (error.message === "MW_SESSION_CHANGED") throw new ServiceError(409, shiftConflict(byId.get(error.details ?? "")?.title));
    if (!functionMissing(error)) adminFail(error, refusals);
    await shiftWithoutFunction(moved, options.by);
  }
  const logged = moved.map(({ before, after }) => ({ session: before, changes: scheduleChanges(before, after) })).filter(entry => entry.changes.length);
  const seen = moved.filter(({ before }) => before.status === "terbit");
  const settings = await mainWamSettingsState();
  const day = seen.length ? eventDay(wibDate(seen[0].after.startsAt), settings.event)?.day : undefined;
  const told = await logAndTell(logged, options.by, options.notify && seen.length
    ? { ...shiftNote(seen.map(({ before }) => before), minutes), link: seen.length === 1 ? mainWamPath.session(seen[0].before.id) : mainWamPath.agenda(day), tag: seen.length === 1 ? `sesi-${seen[0].before.id}` : undefined }
    : null);
  return { sessions: await sessionsOrWait(), ...told };
}

/**
 * Before E's migration (no mw_admin_shift_sessions): the versions were compared just above, then
 * one statement moves them all. An upsert of rows that all exist is one UPDATE per row; every row
 * names the same columns (a draft keeps its own "diubah" mark), so none is reset to its default.
 */
async function shiftWithoutFunction(moved: { before: AdminSession; after: AdminSession }[], by: string | null): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db().from("mw_sessions").upsert(moved.map(({ before, after }) => ({
    id: before.id, title: before.title, starts_at: after.startsAt, ends_at: after.endsAt, updated_at: now,
    changed_at: before.status !== "draf" ? now : before.changedAt, changed_by: before.status !== "draf" ? by : before.changedBy,
  })), { onConflict: "id" });
  if (error) adminFail(error, refusals);
}

/**
 * Deletes a session that has nothing people made (audit M4). One with absen, tagged Momen photos,
 * a Silent Meeting question or an Awarding category is refused with what it has: cancel it instead
 * (status Batal), so its records stay and participants see it crossed out. Its kelompok kegiatan
 * and Riwayat perubahan go with it.
 */
export async function deleteSession(id: string): Promise<{ sessions: AdminSession[] }> {
  const { error } = await db().rpc("mw_admin_delete_session", { p_session: id });
  if (error) {
    if (error.message === "MW_SESSION_IN_USE") throw new ServiceError(409, deleteRefusal((await usageOf([id]))?.get(id) ?? null));
    if (!functionMissing(error)) adminFail(error, { ...refusals, inUse: IN_USE_REFUSAL });
    await deleteWithoutFunction(id);
  }
  return { sessions: await sessionsOrWait() };
}

/**
 * Before E's migration: absen and tagged photos are counted first; a Silent Meeting question or an
 * Awarding category is refused by the database itself (foreign keys, 23503 → 409 "Pakai Batalkan").
 */
async function deleteWithoutFunction(id: string): Promise<void> {
  const [attendance, photos] = await Promise.all([
    db().from("mw_attendance").select("employee_id", { count: "exact", head: true }).eq("session_id", id),
    db().from("mw_photos").select("id", { count: "exact", head: true }).eq("session_id", id),
  ]);
  if (attendance.error) adminFail(attendance.error);
  const usage: SessionUsage = { attendance: attendance.count ?? 0, photos: photos.error ? 0 : photos.count ?? 0, silent: false, awards: 0, activityGroups: 0 };
  if (usage.attendance || usage.photos) throw new ServiceError(409, deleteRefusal(usage));
  const { data, error } = await db().from("mw_sessions").delete().eq("id", id).select("id");
  if (error) adminFail(error, { ...refusals, inUse: IN_USE_REFUSAL });
  if (!data?.length) throw new ServiceError(404, "Sesi tidak ditemukan. Muat ulang halaman.");
}
