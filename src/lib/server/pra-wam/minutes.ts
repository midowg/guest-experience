import "server-only";
import { minutesOpen, minutesStatus, needsMinutes, type MinuteAction, type Minutes, type MinutesInput, type MinutesTelegram, type MinutesView } from "@/lib/pra-wam/minutes";
import { managesSessions } from "@/lib/pra-wam/roles";
import type { Session } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { deliverMinutes, isHodMeeting, minutesDeliveries, minutesTargets } from "./minutes-telegram";
import type { Member } from "./session";
import { getSession } from "./sessions";

/*
 * Notulen (MoM) per meeting (11 Nov 2026, migration 202611110002): read and written here only.
 * Who may read follows Detail sesi (getSession: the people in it, panitia, BOD, admin, and the
 * HOD/Lead of the booker's department); who may write is anyone in it, and panitia/admin.
 *
 * Kirim MoM (12 Nov 2026, migration 202611120004): a saved MoM is a draft until someone in the
 * meeting presses Kirim MoM; then it goes to the meeting's Telegram groups as a PDF, and each later
 * save is a new version that changes those messages in place. A follow-up keeps its done and who
 * ticked it across saves. Before that migration a save is the MoM itself, as before.
 */

export const MINUTES_MIGRATION = "202611110002_pw_session_minutes.sql";
const tableMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /relation .*pw_session_minute/.test(error.message ?? "");
const columnMissing = (error: { code?: string; message?: string }) =>
  ["42703", "PGRST204"].includes(error.code ?? "") || /sent_at|sent_by|telegram_off|version|done_at|done_by/.test(error.message ?? "");
const missing = (error: { code?: string; message?: string }) => tableMissing(error) || columnMissing(error);
const waiting = () => new ServiceError(503, `Notulen menunggu migrasi ${MINUTES_MIGRATION}.`);

const BASE = "session_id,summary,decisions,submitted_by,submitted_at,updated_by,updated_at";
const SEND = `${BASE},sent_at,sent_by,version,telegram_off`;
type MinutesRow = {
  session_id: string; summary: string; decisions: string; submitted_by: string | null; submitted_at: string; updated_by: string | null; updated_at: string;
  sent_at?: string | null; sent_by?: string | null; version?: number; telegram_off?: boolean;
};
type ActionRow = { id: string; session_id: string; sort_order: number; task: string; pic_id: string | null; due_date: string | null; done: boolean; done_at?: string | null; done_by?: string | null };

const canWrite = (session: Session, member: Member) => session.isParticipant || managesSessions(member);

/** The people who may be a follow-up's PIC: those in the meeting. */
async function meetingPeople(sessionId: string): Promise<{ id: string; name: string }[]> {
  const [{ data, error }, people] = await Promise.all([
    createPrivilegedClient().from("pw_session_participants").select("employee_id").eq("session_id", sessionId),
    listPeople(),
  ]);
  if (error) databaseError(error);
  const ids = new Set((data ?? []).map(row => row.employee_id as string));
  return people.filter(person => ids.has(person.id)).map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/** The MoM row: with the send columns when migration 202611120004 has run (`sending`), else without. */
async function readRow(sessionId: string): Promise<{ row: MinutesRow | null; sending: boolean }> {
  const client = createPrivilegedClient();
  const first = await client.from("pw_session_minutes").select(SEND).eq("session_id", sessionId).maybeSingle();
  if (!first.error) return { row: first.data as MinutesRow | null, sending: true };
  if (tableMissing(first.error) || !columnMissing(first.error)) throw first.error;
  const second = await client.from("pw_session_minutes").select(BASE).eq("session_id", sessionId).maybeSingle();
  if (second.error) throw second.error;
  return { row: second.data as MinutesRow | null, sending: false };
}

async function readMinutes(sessionId: string): Promise<{ migrated: boolean; sending: boolean; minutes: Minutes | null }> {
  let read: { row: MinutesRow | null; sending: boolean };
  try { read = await readRow(sessionId); }
  catch (problem) {
    const error = problem as { code?: string; message?: string };
    if (missing(error)) return { migrated: false, sending: false, minutes: null };
    databaseError(error as { message: string });
  }
  const { data: actions, error: actionError } = await createPrivilegedClient().from("pw_session_minute_actions")
    .select("id,session_id,sort_order,task,pic_id,due_date,done").eq("session_id", sessionId).order("sort_order");
  if (actionError) { if (missing(actionError)) return { migrated: false, sending: false, minutes: null }; databaseError(actionError); }
  const { row, sending } = read;
  if (!row) return { migrated: true, sending, minutes: null };
  const names = new Map((await listPeople()).map(person => [person.id, person.name]));
  const name = (id: string | null | undefined) => (id ? names.get(id) ?? "Tanpa nama" : null);
  return {
    migrated: true, sending,
    minutes: {
      summary: row.summary, decisions: row.decisions,
      submittedBy: name(row.submitted_by), submittedAt: row.submitted_at,
      updatedBy: name(row.updated_by), updatedAt: row.updated_at,
      // Before migration 202611120004 every saved MoM counts as sent, as it did.
      sentAt: sending ? row.sent_at ?? null : row.submitted_at, sentBy: sending ? name(row.sent_by) : name(row.submitted_by),
      version: sending ? row.version ?? 0 : 1, telegramOff: sending ? !!row.telegram_off : false,
      actions: ((actions ?? []) as ActionRow[]).map(action => ({
        id: action.id, task: action.task, picId: action.pic_id, picName: name(action.pic_id), dueDate: action.due_date, done: action.done,
      })),
    },
  };
}

/** Telegram under the MoM: whether it can go, where it would go (for a writer), and where it went. */
async function telegramView(session: Session, sending: boolean, write: boolean): Promise<MinutesTelegram> {
  if (!sending) return { ready: false, reason: "Pengiriman MoM ke Telegram menunggu pembaruan sistem.", destinations: [], deliveries: [] };
  const [targets, deliveries] = await Promise.all([
    write ? minutesTargets(session).catch(() => ({ ready: false, reason: "Tujuan Telegram belum terbaca.", groups: [] })) : Promise.resolve(null),
    minutesDeliveries(session.id).catch(() => []),
  ]);
  return {
    ready: targets ? targets.ready : true, reason: targets?.reason ?? null,
    destinations: targets ? targets.groups.map(group => group.title) : [], deliveries,
  };
}

/** Detail sesi's MoM part, for a session the viewer may already open. */
export async function minutesView(session: Session, member: Member, now = new Date()): Promise<MinutesView> {
  const { migrated, sending, minutes } = await readMinutes(session.id).catch(() => ({ migrated: false, sending: false, minutes: null }));
  const open = minutesOpen(session, now);
  const write = migrated && canWrite(session, member) && open;
  // A draft is only for those who may write it; the others see that it is being written.
  const shown = minutes && !minutes.sentAt && !write ? null : minutes;
  return {
    migrated, needed: needsMinutes(session), status: minutesStatus(session, !!minutes, now, !!minutes?.sentAt), minutes: shown,
    canWrite: write, people: write ? await meetingPeople(session.id).catch(() => []) : [], viewerId: member.id, open, endsAt: session.endsAt, drafts: sending,
    telegram: await telegramView(session, sending, write),
  };
}

/**
 * Saves a meeting's MoM: anyone in it (or panitia/admin), once it has started. The first to save
 * is its notetaker; later saves are noted as the last change. With `send` a draft is sent; once
 * sent, every save is a new version and goes to Telegram again (the same messages, changed).
 */
export async function saveMinutes(sessionId: string, input: MinutesInput, member: Member, now = new Date()): Promise<{ view: MinutesView; sentNow: boolean }> {
  const session = await getSession(sessionId, member);
  if (!canWrite(session, member)) throw new ServiceError(403, "Hanya yang ikut meeting ini yang bisa menulis notulennya.");
  if (!minutesOpen(session, now)) throw new ServiceError(409, session.status === "terbit" ? "Notulen bisa ditulis setelah meeting dimulai." : "Notulen hanya untuk meeting yang terbit.");
  const people = new Set((await meetingPeople(sessionId)).map(person => person.id));
  const stranger = input.actions.find(action => action.picId && !people.has(action.picId));
  if (stranger) throw new ServiceError(422, "PIC tindak lanjut harus orang yang ikut meeting ini.", { actions: ["Pilih PIC dari peserta meeting."] });
  const client = createPrivilegedClient();
  const at = now.toISOString();
  let before: { row: MinutesRow | null; sending: boolean };
  try { before = await readRow(sessionId); }
  catch (problem) { const error = problem as { code?: string; message: string }; if (missing(error)) throw waiting(); databaseError(error); }
  const { row, sending } = before;
  const wasSent = sending ? !!row?.sent_at : !!row;
  const sentNow = sending && !wasSent && input.send;
  const send = sending ? {
    telegram_off: input.telegramOff,
    ...(sentNow ? { sent_at: at, sent_by: member.id, version: 1 } : wasSent ? { version: (row?.version ?? 1) + 1 } : {}),
  } : {};
  const values = { summary: input.summary, decisions: input.decisions, updated_by: member.id, updated_at: at, ...send };
  const { error } = row
    ? await client.from("pw_session_minutes").update(values).eq("session_id", sessionId)
    : await client.from("pw_session_minutes").insert({ session_id: sessionId, ...values, submitted_by: member.id, submitted_at: at });
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }

  // The follow-ups are written anew, but one ticked done before keeps when and by whom.
  const { data: earlier } = await client.from("pw_session_minute_actions").select("id,done,done_at,done_by").eq("session_id", sessionId);
  const ticked = new Map(((earlier ?? []) as Pick<ActionRow, "id" | "done" | "done_at" | "done_by">[]).filter(action => action.done).map(action => [action.id, action]));
  const { error: clearError } = await client.from("pw_session_minute_actions").delete().eq("session_id", sessionId);
  if (clearError) databaseError(clearError);
  if (input.actions.length) {
    const { error: actionError } = await client.from("pw_session_minute_actions").insert(input.actions.map((action, index) => {
      const kept = action.id && action.done ? ticked.get(action.id) : undefined;
      return {
        session_id: sessionId, sort_order: index, task: action.task, pic_id: action.picId, due_date: action.dueDate, done: action.done,
        done_at: action.done ? kept?.done_at ?? at : null, done_by: action.done ? kept?.done_by ?? member.id : null,
      };
    }));
    if (actionError) databaseError(actionError);
  }

  const { minutes } = await readMinutes(sessionId);
  if (minutes?.sentAt && !minutes.telegramOff) await deliverMinutes(session, minutes, now);
  if (sentNow) {
    // Everyone in the meeting hears of it in WAM too, Telegram or not.
    const { notifyPeople } = await import("./announcements");
    await notifyPeople([...people].filter(id => id !== member.id), {
      title: `MoM ${session.title} sudah dikirim`, body: "Notulen meeting ini bisa dibaca di Detail sesi.", sessionId, topic: "forum", tag: `mom-${sessionId}`,
    }, member);
  }
  return { view: await minutesView(session, member, now), sentNow };
}

/** Ticks a follow-up done (or not): anyone who may write the MoM, or its PIC. */
export async function setActionDone(sessionId: string, actionId: string, done: boolean, member: Member): Promise<MinuteAction> {
  const session = await getSession(sessionId, member);
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_session_minute_actions").select("id,pic_id").eq("id", actionId).eq("session_id", sessionId).maybeSingle();
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Tindak lanjut tidak ditemukan.");
  if (!canWrite(session, member) && data.pic_id !== member.id) throw new ServiceError(403, "Hanya peserta meeting atau PIC-nya yang bisa menandai tindak lanjut.");
  const { error: saveError } = await client.from("pw_session_minute_actions")
    .update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? member.id : null }).eq("id", actionId);
  if (saveError) databaseError(saveError);
  const view = await readMinutes(sessionId);
  const action = view.minutes?.actions.find(item => item.id === actionId);
  if (!action) throw new ServiceError(404, "Tindak lanjut tidak ditemukan.");
  return action;
}

/** A MoM for its PDF: one the viewer may read (a draft only for whoever may write it). */
export async function minutesForPdf(sessionId: string, member: Member): Promise<{ session: Session; minutes: Minutes; hod: boolean }> {
  const session = await getSession(sessionId, member);
  const { minutes } = await readMinutes(sessionId);
  if (!minutes || (!minutes.sentAt && !canWrite(session, member))) throw new ServiceError(404, "Notulen belum ada.");
  return { session, minutes, hod: await isHodMeeting(session) };
}

/** Which of these sessions have a sent MoM; null before the migration (then nothing counts as missing). */
export async function sessionsWithMinutes(sessionIds: readonly string[]): Promise<Set<string> | null> {
  if (!sessionIds.length) return new Set();
  const client = createPrivilegedClient();
  let { data, error } = await client.from("pw_session_minutes").select("session_id").in("session_id", [...sessionIds]).not("sent_at", "is", null);
  // Before migration 202611120004 every saved MoM is sent.
  if (error && columnMissing(error) && !tableMissing(error)) ({ data, error } = await client.from("pw_session_minutes").select("session_id").in("session_id", [...sessionIds]));
  if (error) { if (missing(error)) return null; databaseError(error); }
  return new Set((data ?? []).map(row => row.session_id as string));
}

/** The meetings over whose MoM is missing (or still a draft), newest first (Ringkasan, Jadwal sesi). */
export async function missingMinutes(sessions: readonly Session[], now = new Date()): Promise<{ migrated: boolean; sessions: Session[] }> {
  const due = sessions.filter(session => minutesStatus(session, false, now) === "belum");
  const has = await sessionsWithMinutes(due.map(session => session.id)).catch(() => null);
  if (!has) return { migrated: false, sessions: [] };
  return { migrated: true, sessions: due.filter(session => !has.has(session.id)).sort((a, b) => b.endsAt!.localeCompare(a.endsAt!)) };
}

/** The viewer's own meetings that are over and still need a MoM, newest first (Agenda's reminder). */
export async function myMinutesDue(member: Member, now = new Date()): Promise<Session[]> {
  const { listSessions } = await import("./sessions");
  const { sessions } = await listSessions(member);
  return (await missingMinutes(sessions.filter(session => session.isParticipant), now)).sessions;
}
