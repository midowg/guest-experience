import "server-only";
import { changeNote, scheduleChanges, sessionRow, shifted, shiftNote, type AdminSession, type SessionInput } from "@/lib/main-wam/admin/rundown";
import { SESSION_COLUMNS, sessionFromRow } from "@/lib/main-wam/rows";
import { byStart, eventDates, eventDay, wibDate } from "@/lib/main-wam/rundown";
import type { RundownChange } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { isSupabaseConfigured, ServiceError } from "../../config";
import { mwMissing, mwWaiting, type Read } from "../errors";
import { trySendMainWamNote } from "../notes";
import { mainWamSettingsState } from "../settings";
import { adminFail, assertPeople, db } from "./common";

/*
 * Admin WAM → Main WAM → Rundown (agen E): mw_sessions as the admin manages them, drafts included.
 * A change to a published session's time, place or status is logged (mw_rundown_log, "diubah
 * oleh") and the session is marked changed; with "Kabari peserta" the participants get one note
 * (tag sesi-<id>, so the latest replaces the one before). Every answer is the whole rundown again,
 * so the page swaps its list without reloading.
 */

const refusals = { invalid: "Isian sesi belum sesuai aturan (jam selesai setelah mulai, makan tanpa absen, wajib dengan absen).", inUse: "Denah atau kontak panitia sudah tidak ada. Pilih lagi." };

/** Every session with its row version, fresh (not the per-request cache: the answer follows a write). */
export async function adminSessions(): Promise<Read<AdminSession[]>> {
  if (!isSupabaseConfigured()) return { data: [], migrated: false };
  const { data, error } = await db().from("mw_sessions").select(`${SESSION_COLUMNS},updated_at`).order("starts_at").order("sort").limit(500);
  if (error) { if (mwMissing(error)) return { data: [], migrated: false }; adminFail(error); }
  return {
    data: ((data ?? []) as Record<string, unknown>[]).map(row => ({ ...sessionFromRow(row), version: typeof row.updated_at === "string" ? row.updated_at : null })).sort(byStart),
    migrated: true,
  };
}
async function sessionsOrWait(): Promise<AdminSession[]> {
  const { data, migrated } = await adminSessions();
  if (!migrated) throw mwWaiting();
  return data;
}

/** The day is one of the event's, and the guide and contact exist. */
async function checkInputs(inputs: readonly SessionInput[]): Promise<void> {
  const settings = await mainWamSettingsState();
  if (!settings.migrated) throw mwWaiting();
  const dates = eventDates(settings.event);
  const outside = inputs.find(input => !dates.includes(input.date));
  if (outside) throw new ServiceError(422, `Hari ${outside.date} di luar tanggal acara (${dates[0]} sampai ${dates.at(-1)}).`, { date: ["Pilih hari acara."] });
  const guides = [...new Set(inputs.map(input => input.mapGuideId).filter((id): id is string => !!id))];
  if (guides.length) {
    const { data, error } = await db().from("mw_guides").select("id").in("id", guides);
    if (error) adminFail(error);
    if ((data ?? []).length !== guides.length) throw new ServiceError(422, "Denah yang dipilih sudah tidak ada. Pilih lagi.", { mapGuideId: ["Pilih denah lagi."] });
  }
  await assertPeople(inputs.map(input => input.contactId));
}

export async function createSession(input: SessionInput): Promise<{ sessions: AdminSession[]; id: string }> {
  await checkInputs([input]);
  const { data, error } = await db().from("mw_sessions").insert(sessionRow(input)).select("id").single();
  if (error) adminFail(error, refusals);
  return { sessions: await sessionsOrWait(), id: data.id as string };
}

/** Many sessions from a pasted sheet, in one statement (all or nothing). */
export async function importSessions(inputs: readonly SessionInput[]): Promise<{ sessions: AdminSession[]; added: number }> {
  await checkInputs(inputs);
  const { error } = await db().from("mw_sessions").insert(inputs.map(sessionRow));
  if (error) adminFail(error, refusals);
  return { sessions: await sessionsOrWait(), added: inputs.length };
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
  if (!eventDates(settings.event).includes(to)) throw new ServiceError(422, "Pilih hari acara.", { date: ["Pilih hari acara."] });
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  const moved = shifted(source, days * 24 * 60);
  const { data, error } = await db().from("mw_sessions").insert({
    title: source.title, kind: source.kind, status: "draf", starts_at: moved.startsAt, ends_at: moved.endsAt, place: source.place, map_guide_id: source.mapGuideId,
    dresscode: source.dresscode, bring: source.bring, lineup: source.lineup, meal: source.meal, contact_id: source.contactId, uses_attendance: source.usesAttendance,
    required: source.required, optional: source.optional, module: source.module, description: source.description, sort: source.sort + 1,
  }).select("id").single();
  if (error) adminFail(error, refusals);
  return { sessions: await sessionsOrWait(), id: data.id as string };
}

/**
 * Moves sessions by some minutes in one statement (all or nothing). Published ones are logged;
 * `notify` sends one note for all of them.
 */
export async function shiftSessions(ids: readonly string[], minutes: number, options: { notify: boolean; by: string | null }): Promise<{ sessions: AdminSession[] } & Told> {
  const all = await sessionsOrWait();
  const picked = all.filter(session => ids.includes(session.id));
  if (picked.length !== new Set(ids).size) throw new ServiceError(404, "Ada sesi yang sudah tidak ada. Muat ulang halaman.");
  const now = new Date().toISOString();
  const moved = picked.map(session => ({ before: session, after: shifted(session, minutes) }));
  // An upsert of rows that all exist is one UPDATE per row inside one statement. Every row names
  // the same columns (a draft keeps its own "diubah" mark), so none is reset to its default.
  const { error } = await db().from("mw_sessions").upsert(moved.map(({ before, after }) => ({
    id: before.id, title: before.title, starts_at: after.startsAt, ends_at: after.endsAt, updated_at: now,
    changed_at: before.status !== "draf" ? now : before.changedAt, changed_by: before.status !== "draf" ? options.by : before.changedBy,
  })), { onConflict: "id" });
  if (error) adminFail(error, refusals);
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
 * Deletes a session. One with check-ins is kept (cancel it instead: its absen stays on record);
 * its photos stay as Umum, its Silent Meeting question goes with it.
 */
export async function deleteSession(id: string): Promise<{ sessions: AdminSession[] }> {
  const { count, error: countError } = await db().from("mw_attendance").select("employee_id", { count: "exact", head: true }).eq("session_id", id);
  if (countError) adminFail(countError);
  if (count) throw new ServiceError(409, `Sesi ini sudah punya ${count} absen. Ubah statusnya menjadi Batal supaya catatan absennya tetap ada.`);
  const { data, error } = await db().from("mw_sessions").delete().eq("id", id).select("id");
  if (error) adminFail(error, refusals);
  if (!data?.length) throw new ServiceError(404, "Sesi tidak ditemukan. Muat ulang halaman.");
  return { sessions: await sessionsOrWait() };
}
