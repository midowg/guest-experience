import "server-only";
import { wibDate } from "@/lib/pra-wam/appraisal";
import {
  actionPicIds, itemsAsText, minutesClosed, minutesDeadline, minutesNumber, minutesOpen, minutesStatus, needsMinutes, selfCheckedIn,
  type MinuteAction, type MinuteItem, type Minutes, type MinutesInput, type MinutesTelegram, type MinutesView,
} from "@/lib/pra-wam/minutes";
import type { Session } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { attendeesOf, recordMinutesAttendance } from "./minutes-people";
import { listMinutePhotos, mayWriteMinutes, photosHd } from "./minutes-photos";
import { deliverMinutes, isHodMeeting, minutesDeliveries, minutesTargets } from "./minutes-telegram";
import type { Member } from "./session";
import { getSession, sessionsByIds } from "./sessions";

/*
 * Notulen (MoM) per meeting (11 Nov 2026, migration 202611110002): read and written here only.
 * Who may read follows Detail sesi (getSession: the people in it, panitia, BOD, admin, and the
 * HOD/Lead of the booker's department); who may write is anyone in it, and panitia/admin.
 *
 * Kirim MoM (12 Nov 2026, migration 202611120004): a saved MoM is a draft until someone in the
 * meeting presses Kirim MoM; then it goes to the meeting's Telegram groups as a PDF, and each later
 * save is a new version that changes those messages in place. A follow-up keeps its done and who
 * ticked it across saves. Before that migration a save is the MoM itself, as before.
 *
 * Form FRM (12 Nov 2026, migration 202611120005): the MoM's number, chairperson, who came, the
 * agenda items, the next meeting and the photos; one save is one transaction (pw_save_minutes).
 * Before that migration the agenda items are kept as the summary and decisions, as before.
 *
 * Nomor surat MoM (13 Nov 2026, migration 202611130001): the number the notetaker types, kept in
 * pw_session_minutes.doc_number, read and written on its own so the MoM works without the column.
 */

export const MINUTES_MIGRATION = "202611110002_pw_session_minutes.sql";
const tableMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /relation .*pw_session_minute/.test(error.message ?? "");
const columnMissing = (error: { code?: string; message?: string }) =>
  (["42703", "PGRST204"].includes(error.code ?? "") || /column .* does not exist|Could not find the .* column/.test(error.message ?? ""))
  && /sent_at|sent_by|telegram_off|version|done_at|done_by|number|chair_id|items|absent_ids|guests|next_(date|time|place|agenda)/.test(error.message ?? "");
const missing = (error: { code?: string; message?: string }) => tableMissing(error) || columnMissing(error);
/** doc_number is not there yet (before migration 202611130001). */
const docNumberMissing = (error: { code?: string; message?: string }) =>
  ["42703", "PGRST204"].includes(error.code ?? "") || /doc_number/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Notulen menunggu migrasi ${MINUTES_MIGRATION}.`);

const BASE = "session_id,summary,decisions,submitted_by,submitted_at,updated_by,updated_at";
const SEND = `${BASE},sent_at,sent_by,version,telegram_off`;
const FRM = `${SEND},number,chair_id,items,absent_ids,guests,next_date,next_time,next_place,next_agenda`;
/** What the database has: 0 before drafts (202611120004), 1 with drafts, 2 with the FRM form (202611120005). */
type Level = 0 | 1 | 2;
type MinutesRow = {
  session_id: string; summary: string; decisions: string; submitted_by: string | null; submitted_at: string; updated_by: string | null; updated_at: string;
  sent_at?: string | null; sent_by?: string | null; version?: number; telegram_off?: boolean;
  number?: number | null; chair_id?: string | null; items?: unknown; absent_ids?: string[] | null; guests?: string | null;
  next_date?: string | null; next_time?: string | null; next_place?: string | null; next_agenda?: string | null;
};
type ActionRow = { id: string; session_id: string; sort_order: number; task: string; pic_id: string | null; due_date: string | null; done: boolean; done_at?: string | null; done_by?: string | null };

/** The stored agenda items, read safely. */
function asItems(value: unknown): MinuteItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && typeof (item as { topic?: unknown }).topic === "string")
    .map(item => ({
      topic: String(item.topic), discussion: typeof item.discussion === "string" ? item.discussion : "",
      decision: typeof item.decision === "string" ? item.decision : "", added: item.added === true,
    }));
}

/** The MoM row: with as many columns as the migrations that have run allow. */
async function readRow(sessionId: string): Promise<{ row: MinutesRow | null; level: Level }> {
  const client = createPrivilegedClient();
  const tiers: [string, Level][] = [[FRM, 2], [SEND, 1], [BASE, 0]];
  for (const [columns, level] of tiers) {
    const { data, error } = await client.from("pw_session_minutes").select(columns).eq("session_id", sessionId).maybeSingle();
    if (!error) return { row: data as MinutesRow | null, level };
    if (tableMissing(error) || !columnMissing(error) || level === 0) throw error;
  }
  throw new Error("unreachable");
}

/** The nomor surat MoM typed for this session; null when none, or before migration 202611130001. */
async function readDocNumber(sessionId: string): Promise<string | null> {
  const { data, error } = await createPrivilegedClient().from("pw_session_minutes").select("doc_number").eq("session_id", sessionId).maybeSingle();
  if (error) { if (docNumberMissing(error) || missing(error)) return null; databaseError(error); }
  const value = (data as { doc_number?: string | null } | null)?.doc_number?.trim();
  return value || null;
}

/** Keeps the nomor surat MoM as typed (empty = none); before migration 202611130001 it is not kept. */
async function saveDocNumber(sessionId: string, docNumber: string): Promise<void> {
  const { error } = await createPrivilegedClient().from("pw_session_minutes").update({ doc_number: (docNumber ?? "").trim() || null }).eq("session_id", sessionId);
  if (error && !docNumberMissing(error)) databaseError(error);
}

/*
 * 13 Nov 2026 (migration 202611130003): a follow-up's PICs (pic_ids) and the Telegram groups picked
 * (telegram_chats), read and written on their own so the MoM works without the columns.
 */
const extrasMissing = (error: { code?: string; message?: string }) =>
  ["42703", "PGRST204"].includes(error.code ?? "") || /pic_ids|telegram_chats/.test(error.message ?? "");

async function readExtras(sessionId: string): Promise<{ pics: Map<string, string[]>; chats: string[] | null }> {
  const client = createPrivilegedClient();
  const [actions, minutes] = await Promise.all([
    client.from("pw_session_minute_actions").select("id,pic_ids").eq("session_id", sessionId),
    client.from("pw_session_minutes").select("telegram_chats").eq("session_id", sessionId).maybeSingle(),
  ]);
  const pics = new Map(actions.error ? [] : ((actions.data ?? []) as { id: string; pic_ids: string[] | null }[]).map(row => [row.id, row.pic_ids ?? []]));
  const chats = minutes.error ? null : ((minutes.data as { telegram_chats?: string[] | null } | null)?.telegram_chats ?? null);
  return { pics, chats };
}

/** Keeps each follow-up's PICs, by its place in the list (the save above gave it that place). */
async function savePicIds(sessionId: string, actions: MinutesInput["actions"]): Promise<void> {
  const client = createPrivilegedClient();
  for (const [index, action] of actions.entries()) {
    const { error } = await client.from("pw_session_minute_actions").update({ pic_ids: actionPicIds(action) }).eq("session_id", sessionId).eq("sort_order", index);
    if (error) { if (extrasMissing(error)) return; databaseError(error); }
  }
}

/** Keeps the Telegram groups picked (none picked is an empty list: the MoM goes nowhere in Telegram). */
async function saveTelegramChats(sessionId: string, chats: readonly string[]): Promise<void> {
  const { error } = await createPrivilegedClient().from("pw_session_minutes").update({ telegram_chats: [...new Set(chats)] }).eq("session_id", sessionId);
  if (error && !extrasMissing(error)) databaseError(error);
}

type Read = { migrated: boolean; level: Level; minutes: Minutes | null };

async function readMinutes(session: Pick<Session, "id" | "startsAt">): Promise<Read> {
  let read: { row: MinutesRow | null; level: Level };
  try { read = await readRow(session.id); }
  catch (problem) {
    const error = problem as { code?: string; message?: string };
    if (missing(error)) return { migrated: false, level: 0, minutes: null };
    databaseError(error as { message: string });
  }
  const { data: actions, error: actionError } = await createPrivilegedClient().from("pw_session_minute_actions")
    .select("id,session_id,sort_order,task,pic_id,due_date,done").eq("session_id", session.id).order("sort_order");
  if (actionError) { if (missing(actionError)) return { migrated: false, level: 0, minutes: null }; databaseError(actionError); }
  const { row, level } = read;
  if (!row) return { migrated: true, level, minutes: null };
  const [people, docNumber, extras] = await Promise.all([listPeople(), readDocNumber(session.id), readExtras(session.id)]);
  const names = new Map(people.map(person => [person.id, person.name]));
  const name = (id: string | null | undefined) => (id ? names.get(id) ?? "Tanpa nama" : null);
  const sending = level >= 1;
  const frm = level >= 2;
  const day = session.startsAt ? wibDate(session.startsAt) : wibDate(row.submitted_at);
  const next = frm && (row.next_date || row.next_time || row.next_place || row.next_agenda)
    ? { date: row.next_date ?? null, time: row.next_time ?? null, place: row.next_place ?? "", agenda: row.next_agenda ?? "" } : null;
  return {
    migrated: true, level,
    minutes: {
      summary: row.summary, decisions: row.decisions,
      submittedBy: name(row.submitted_by), submittedAt: row.submitted_at,
      updatedBy: name(row.updated_by), updatedAt: row.updated_at,
      // Before migration 202611120004 every saved MoM counts as sent, as it did.
      sentAt: sending ? row.sent_at ?? null : row.submitted_at, sentBy: sending ? name(row.sent_by) : name(row.submitted_by),
      version: sending ? row.version ?? 0 : 1, telegramOff: sending ? !!row.telegram_off : false,
      number: frm && row.number ? minutesNumber(row.number, day) : null,
      docNumber,
      items: frm ? asItems(row.items) : [],
      chairId: frm ? row.chair_id ?? null : null, chairName: frm ? name(row.chair_id) : null,
      absentIds: frm ? row.absent_ids ?? [] : [], guests: frm ? row.guests ?? "" : "", next,
      actions: ((actions ?? []) as ActionRow[]).map(action => {
        const kept = extras.pics.get(action.id) ?? [];
        const picIds = kept.length ? kept : action.pic_id ? [action.pic_id] : [];
        return {
          id: action.id, task: action.task, picId: picIds[0] ?? null, picName: name(picIds[0]), dueDate: action.due_date, done: action.done,
          picIds, picNames: picIds.map(id => name(id) ?? "Tanpa nama"),
        };
      }),
      telegramChats: extras.chats,
    },
  };
}

/** Telegram under the MoM: whether it can go, where it would go (for a writer), and where it went. */
async function telegramView(session: Session, sending: boolean, write: boolean): Promise<MinutesTelegram> {
  if (!sending) return { ready: false, reason: "Pengiriman MoM ke Telegram menunggu pembaruan sistem.", destinations: [], deliveries: [] };
  const [targets, deliveries] = await Promise.all([
    write ? minutesTargets(session).catch(() => ({ ready: false, reason: "Tujuan Telegram belum terbaca.", groups: [], all: [] })) : Promise.resolve(null),
    minutesDeliveries(session.id).catch(() => []),
  ]);
  return {
    ready: targets ? targets.ready : true, reason: targets?.reason ?? null,
    destinations: targets ? targets.groups.map(group => group.title) : [], deliveries,
    links: targets ? targets.groups.map(group => ({ title: group.title, url: group.inviteLink ?? null })) : [],
    groups: targets ? targets.all.map(group => ({ chatId: group.chatId, title: group.title, url: group.inviteLink ?? null, suggested: targets.groups.some(item => item.chatId === group.chatId) })) : [],
  };
}

/** Detail sesi's MoM part, for a session the viewer may already open. */
export async function minutesView(session: Session, member: Member, now = new Date()): Promise<MinutesView> {
  const { migrated, level, minutes } = await readMinutes(session).catch((): Read => ({ migrated: false, level: 0, minutes: null }));
  const open = minutesOpen(session, now);
  const write = migrated && mayWriteMinutes(session, member) && open;
  // Past the 24 hours: those who could write it still see it (a draft too), its buttons off.
  const closed = migrated && mayWriteMinutes(session, member) && minutesClosed(session, now);
  // A draft is only for those who may write it; the others see that it is being written.
  const shown = minutes && !minutes.sentAt && !write && !closed ? null : minutes;
  const frm = level >= 2;
  const [attendees, photos, telegram, photoHd] = await Promise.all([
    shown || write ? attendeesOf(session.id).catch(() => []) : Promise.resolve([]),
    frm && (shown || write) ? listMinutePhotos(session.id, write).catch(() => []) : Promise.resolve([]),
    telegramView(session, level >= 1, write),
    frm && write ? photosHd().catch(() => false) : Promise.resolve(false),
  ]);
  const staff = frm && write ? (await listPeople().catch(() => [])).map(person => ({ id: person.id, name: person.name, fullName: person.fullName ?? person.name, department: person.department })) : [];
  const booker = session.booking?.bookedBy.id ?? null;
  return {
    migrated, needed: needsMinutes(session), status: minutesStatus(session, !!minutes, now, !!minutes?.sentAt), minutes: shown,
    canWrite: write, people: write ? attendees.map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id")) : [],
    viewerId: member.id, open, endsAt: session.endsAt, drafts: level >= 1, telegram, deadline: minutesDeadline(session), closed,
    title: session.title, startsAt: session.startsAt, place: session.roomName ?? session.location ?? "",
    frm, attendees, defaultChairId: booker && attendees.some(person => person.id === booker) ? booker : null,
    photos, photosReady: frm && isR2Configured(), photoHd, staff,
  };
}

/** The agenda items to keep: as given, or (from an app opened before the update) the summary and decisions as one. */
const givenItems = (input: MinutesInput): MinuteItem[] => input.items.length ? input.items
  : [{ topic: "Pembahasan", discussion: input.summary, decision: input.decisions, added: false }];

/** One save in one transaction (migration 202611120005). */
async function saveFrm(sessionId: string, input: MinutesInput, member: Member, at: string): Promise<boolean> {
  const { data, error } = await createPrivilegedClient().rpc("pw_save_minutes", {
    p_session: sessionId, p_member: member.id, p_at: at, p_send: input.send,
    p_minutes: {
      items: givenItems(input), chair_id: input.chairId, absent_ids: input.absentIds, guests: input.guests,
      next_date: input.next.date, next_time: input.next.time, next_place: input.next.place, next_agenda: input.next.agenda,
      telegram_off: input.telegramOff,
    },
    p_actions: input.actions.map(action => ({ id: action.id ?? null, task: action.task, pic_id: action.picId, due_date: action.dueDate })),
  });
  if (error) databaseError(error);
  const row = (Array.isArray(data) ? data[0] : data) as { sent_now?: boolean } | null;
  return !!row?.sent_now;
}

/** Before migration 202611120005: the summary and decisions, then the follow-ups, one after another. */
async function saveBefore(sessionId: string, input: MinutesInput, member: Member, at: string, row: MinutesRow | null, sending: boolean): Promise<boolean> {
  const client = createPrivilegedClient();
  const wasSent = sending ? !!row?.sent_at : !!row;
  const sentNow = sending && !wasSent && input.send;
  const send = sending ? {
    telegram_off: input.telegramOff,
    ...(sentNow ? { sent_at: at, sent_by: member.id, version: 1 } : wasSent ? { version: (row?.version ?? 1) + 1 } : {}),
  } : {};
  const text = input.items.length ? itemsAsText(input.items) : { summary: input.summary, decisions: input.decisions };
  const values = { ...text, updated_by: member.id, updated_at: at, ...send };
  const { error } = row
    ? await client.from("pw_session_minutes").update(values).eq("session_id", sessionId)
    : await client.from("pw_session_minutes").insert({ session_id: sessionId, ...values, submitted_by: member.id, submitted_at: at });
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }

  // The follow-ups are written anew, but one ticked done before keeps when and by whom.
  const { data: earlier } = await client.from("pw_session_minute_actions").select("id,done,done_at,done_by").eq("session_id", sessionId);
  const before = new Map(((earlier ?? []) as Pick<ActionRow, "id" | "done" | "done_at" | "done_by">[]).map(action => [action.id, action]));
  const { error: clearError } = await client.from("pw_session_minute_actions").delete().eq("session_id", sessionId);
  if (clearError) databaseError(clearError);
  if (input.actions.length) {
    const { error: actionError } = await client.from("pw_session_minute_actions").insert(input.actions.map((action, index) => {
      // Done is ticked on its own (setActionDone): a kept follow-up keeps what it has now.
      const kept = action.id ? before.get(action.id) : undefined;
      const done = kept ? kept.done : false;
      return {
        session_id: sessionId, sort_order: index, task: action.task, pic_id: action.picId, due_date: action.dueDate, done,
        done_at: done ? kept?.done_at ?? at : null, done_by: done ? kept?.done_by ?? member.id : null,
      };
    }));
    if (actionError) databaseError(actionError);
  }
  return sentNow;
}

/**
 * Saves a meeting's MoM: anyone in it (or panitia/admin), once it has started. The first to save
 * is its notetaker; later saves are noted as the last change. With `send` a draft is sent; once
 * sent, every save is a new version and goes to Telegram again (the same messages, changed): the
 * hook is deliverMinutes (minutes-telegram.ts), called after every save of a sent MoM.
 */
export async function saveMinutes(sessionId: string, input: MinutesInput, member: Member, now = new Date()): Promise<{ view: MinutesView; sentNow: boolean }> {
  const session = await getSession(sessionId, member);
  if (!mayWriteMinutes(session, member)) throw new ServiceError(403, "Hanya yang ikut meeting ini yang bisa menulis notulennya.");
  if (minutesClosed(session, now)) throw new ServiceError(409, "Batas mengisi atau merevisi MoM sudah lewat (1 x 24 jam setelah meeting selesai).");
  if (!minutesOpen(session, now)) throw new ServiceError(409, session.status === "terbit" ? "Notulen bisa ditulis setelah meeting dimulai." : "Notulen hanya untuk meeting yang terbit.");
  const attendees = await attendeesOf(sessionId);
  const people = new Set(attendees.map(person => person.id));
  // Who checked in by themselves came: the MoM cannot mark them absent.
  const self = new Set(attendees.filter(selfCheckedIn).map(person => person.id));
  // A follow-up's PICs, whichever field an app sent them in; the first is its PIC as before.
  input = { ...input, actions: input.actions.map(action => { const picIds = [...new Set(actionPicIds(action))]; return { ...action, picIds, picId: picIds[0] ?? null }; }) };
  const stranger = input.actions.find(action => action.picIds.some(id => !people.has(id)));
  if (stranger) throw new ServiceError(422, "PIC tindak lanjut harus orang yang ikut meeting ini.", { actions: ["Pilih PIC dari peserta meeting."] });
  if (input.chairId && !people.has(input.chairId)) throw new ServiceError(422, "Pimpinan rapat harus orang yang ikut meeting ini.", { chairId: ["Pilih dari peserta meeting."] });
  const checked: MinutesInput = { ...input, absentIds: [...new Set(input.absentIds)].filter(id => people.has(id) && !self.has(id)) };
  const at = now.toISOString();
  let before: { row: MinutesRow | null; level: Level };
  try { before = await readRow(sessionId); }
  catch (problem) { const error = problem as { code?: string; message: string }; if (missing(error)) throw waiting(); databaseError(error); }
  const sentNow = before.level >= 2
    ? await saveFrm(sessionId, checked, member, at)
    : await saveBefore(sessionId, checked, member, at, before.row, before.level >= 1);
  // Before the MoM is read back below: the PDF and Telegram of this save carry the number typed.
  // An app opened before the field sends none: the number typed earlier then stays.
  if (checked.docNumber !== undefined) await saveDocNumber(sessionId, checked.docNumber);
  await savePicIds(sessionId, checked.actions);
  if (checked.telegramChats !== undefined) await saveTelegramChats(sessionId, checked.telegramChats);

  // The MoM's attendance is the check-in too (FRM form only: before it the MoM keeps no attendance).
  if (before.level >= 2) await recordMinutesAttendance(sessionId, session.startsAt, checked.absentIds, member, now);
  const { minutes } = await readMinutes(session);
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
  let { data, error } = await client.from("pw_session_minute_actions").select("id,pic_id,pic_ids").eq("id", actionId).eq("session_id", sessionId).maybeSingle();
  if (error && extrasMissing(error)) ({ data, error } = await client.from("pw_session_minute_actions").select("id,pic_id").eq("id", actionId).eq("session_id", sessionId).maybeSingle());
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Tindak lanjut tidak ditemukan.");
  const pics = [data.pic_id, ...(((data as { pic_ids?: string[] | null }).pic_ids) ?? [])];
  if (!mayWriteMinutes(session, member) && !pics.includes(member.id)) throw new ServiceError(403, "Hanya peserta meeting atau PIC-nya yang bisa menandai tindak lanjut.");
  const { error: saveError } = await client.from("pw_session_minute_actions")
    .update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? member.id : null }).eq("id", actionId);
  if (saveError) databaseError(saveError);
  const view = await readMinutes(session);
  const action = view.minutes?.actions.find(item => item.id === actionId);
  if (!action) throw new ServiceError(404, "Tindak lanjut tidak ditemukan.");
  // Telegram's message and PDF say how many are still open: changed in place, without a sound,
  // and without a new version (only a follow-up's state changed).
  if (view.minutes?.sentAt && !view.minutes.telegramOff) await deliverMinutes(session, view.minutes);
  return action;
}

/** A MoM for its PDF: one the viewer may read (a draft only for whoever may write it). */
export async function minutesForPdf(sessionId: string, member: Member): Promise<{ session: Session; minutes: Minutes; hod: boolean }> {
  const session = await getSession(sessionId, member);
  const { minutes } = await readMinutes(session);
  if (!minutes || (!minutes.sentAt && !mayWriteMinutes(session, member))) throw new ServiceError(404, "Notulen belum ada.");
  return { session, minutes, hod: await isHodMeeting(session) };
}

/** A sent MoM for the admin console (Arsip MoM): its session, the MoM, and whether it is a Meeting HOD's. */
export async function minutesForConsole(sessionId: string): Promise<{ session: Session; minutes: Minutes; hod: boolean }> {
  const [session] = await sessionsByIds([sessionId]);
  if (!session) throw new ServiceError(404, "MoM tidak ditemukan.");
  const { minutes } = await readMinutes(session);
  if (!minutes?.sentAt) throw new ServiceError(404, "MoM ini belum dikirim.");
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

/**
 * The viewer's own meetings that are over and still need a MoM, newest first (Agenda's reminder),
 * and which of them have a draft already (to continue rather than write).
 */
export async function myMinutesDue(member: Member, now = new Date()): Promise<{ sessions: Session[]; drafts: string[] }> {
  const { listSessions } = await import("./sessions");
  const { sessions } = await listSessions(member);
  // Only those still open: past the 24 hours a MoM can no longer be written (13 Nov 2026).
  const due = (await missingMinutes(sessions.filter(session => session.isParticipant), now)).sessions.filter(session => !minutesClosed(session, now));
  if (!due.length) return { sessions: due, drafts: [] };
  const { data, error } = await createPrivilegedClient().from("pw_session_minutes").select("session_id")
    .in("session_id", due.map(session => session.id)).is("sent_at", null);
  // Before migration 202611120004 there are no drafts.
  return { sessions: due, drafts: error ? [] : (data ?? []).map(row => row.session_id as string) };
}
