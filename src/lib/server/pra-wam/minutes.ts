import "server-only";
import { minutesOpen, minutesStatus, needsMinutes, type MinuteAction, type Minutes, type MinutesInput, type MinutesView } from "@/lib/pra-wam/minutes";
import { managesSessions } from "@/lib/pra-wam/roles";
import type { Session } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import type { Member } from "./session";
import { getSession } from "./sessions";

/*
 * Notulen (MoM) per meeting (11 Nov 2026, migration 202611110002): read and written here only.
 * Who may read follows Detail sesi (getSession: the people in it, panitia, BOD, admin, and the
 * HOD/Lead of the booker's department); who may write is anyone in it, and panitia/admin.
 */

export const MINUTES_MIGRATION = "202611110002_pw_session_minutes.sql";
const missing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_session_minute/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Notulen menunggu migrasi ${MINUTES_MIGRATION}.`);

type MinutesRow = { session_id: string; summary: string; decisions: string; submitted_by: string | null; submitted_at: string; updated_by: string | null; updated_at: string };
type ActionRow = { id: string; session_id: string; sort_order: number; task: string; pic_id: string | null; due_date: string | null; done: boolean };

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

async function readMinutes(sessionId: string): Promise<{ migrated: boolean; minutes: Minutes | null }> {
  const client = createPrivilegedClient();
  const [{ data: row, error }, { data: actions, error: actionError }] = await Promise.all([
    client.from("pw_session_minutes").select("session_id,summary,decisions,submitted_by,submitted_at,updated_by,updated_at").eq("session_id", sessionId).maybeSingle(),
    client.from("pw_session_minute_actions").select("id,session_id,sort_order,task,pic_id,due_date,done").eq("session_id", sessionId).order("sort_order"),
  ]);
  if (error || actionError) {
    const problem = (error ?? actionError)!;
    if (missing(problem)) return { migrated: false, minutes: null };
    databaseError(problem);
  }
  if (!row) return { migrated: true, minutes: null };
  const names = new Map((await listPeople()).map(person => [person.id, person.name]));
  const minutes = row as MinutesRow;
  return {
    migrated: true,
    minutes: {
      summary: minutes.summary, decisions: minutes.decisions,
      submittedBy: minutes.submitted_by ? names.get(minutes.submitted_by) ?? "Tanpa nama" : null, submittedAt: minutes.submitted_at,
      updatedBy: minutes.updated_by ? names.get(minutes.updated_by) ?? "Tanpa nama" : null, updatedAt: minutes.updated_at,
      actions: ((actions ?? []) as ActionRow[]).map(action => ({
        id: action.id, task: action.task, picId: action.pic_id, picName: action.pic_id ? names.get(action.pic_id) ?? "Tanpa nama" : null,
        dueDate: action.due_date, done: action.done,
      })),
    },
  };
}

/** Detail sesi's MoM part, for a session the viewer may already open. */
export async function minutesView(session: Session, member: Member, now = new Date()): Promise<MinutesView> {
  const { migrated, minutes } = await readMinutes(session.id).catch(() => ({ migrated: false, minutes: null }));
  const open = minutesOpen(session, now);
  const write = migrated && canWrite(session, member) && open;
  return {
    migrated, needed: needsMinutes(session), status: minutesStatus(session, !!minutes, now), minutes,
    canWrite: write, people: write ? await meetingPeople(session.id).catch(() => []) : [], viewerId: member.id, open,
  };
}

/**
 * Saves a meeting's MoM: anyone in it (or panitia/admin), once it has started. The first to save
 * is its notetaker; later saves are noted as the last change. The follow-ups are written anew.
 */
export async function saveMinutes(sessionId: string, input: MinutesInput, member: Member, now = new Date()): Promise<MinutesView> {
  const session = await getSession(sessionId, member);
  if (!canWrite(session, member)) throw new ServiceError(403, "Hanya yang ikut meeting ini yang bisa menulis notulennya.");
  if (!minutesOpen(session, now)) throw new ServiceError(409, session.status === "terbit" ? "Notulen bisa ditulis setelah meeting dimulai." : "Notulen hanya untuk meeting yang terbit.");
  const people = new Set((await meetingPeople(sessionId)).map(person => person.id));
  const stranger = input.actions.find(action => action.picId && !people.has(action.picId));
  if (stranger) throw new ServiceError(422, "PIC tindak lanjut harus orang yang ikut meeting ini.", { actions: ["Pilih PIC dari peserta meeting."] });
  const client = createPrivilegedClient();
  const at = now.toISOString();
  const { data: before, error: readError } = await client.from("pw_session_minutes").select("session_id").eq("session_id", sessionId).maybeSingle();
  if (readError) { if (missing(readError)) throw waiting(); databaseError(readError); }
  const values = { summary: input.summary, decisions: input.decisions, updated_by: member.id, updated_at: at };
  const { error } = before
    ? await client.from("pw_session_minutes").update(values).eq("session_id", sessionId)
    : await client.from("pw_session_minutes").insert({ session_id: sessionId, ...values, submitted_by: member.id, submitted_at: at });
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  const { error: clearError } = await client.from("pw_session_minute_actions").delete().eq("session_id", sessionId);
  if (clearError) databaseError(clearError);
  if (input.actions.length) {
    const { error: actionError } = await client.from("pw_session_minute_actions").insert(input.actions.map((action, index) => ({
      session_id: sessionId, sort_order: index, task: action.task, pic_id: action.picId, due_date: action.dueDate,
      done: action.done, done_at: action.done ? at : null, done_by: action.done ? member.id : null,
    })));
    if (actionError) databaseError(actionError);
  }
  return minutesView(session, member, now);
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

/** Which of these sessions have a MoM; null before the migration (then nothing counts as missing). */
export async function sessionsWithMinutes(sessionIds: readonly string[]): Promise<Set<string> | null> {
  if (!sessionIds.length) return new Set();
  const { data, error } = await createPrivilegedClient().from("pw_session_minutes").select("session_id").in("session_id", [...sessionIds]);
  if (error) { if (missing(error)) return null; databaseError(error); }
  return new Set((data ?? []).map(row => row.session_id as string));
}

/** The meetings over whose MoM is missing, newest first (Ringkasan, Jadwal sesi). */
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
