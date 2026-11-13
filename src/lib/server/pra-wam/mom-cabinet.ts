import "server-only";
import { randomUUID } from "node:crypto";
import { departmentShorts } from "@/lib/employees";
import { wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { minutesNumber, type MinuteItem } from "@/lib/pra-wam/minutes";
import { decisionCount, decisionLines, frmDue, guestNames, minutesCode } from "@/lib/pra-wam/minutes-message";
import { MOM_CABINET_MIGRATION } from "@/lib/pra-wam/minutes-photos";
import { activityOf, placeEntries, type CabinetEntry, type CabinetPhoto, type CabinetView } from "@/lib/pra-wam/mom-cabinet";
import type { Session } from "@/lib/pra-wam/sessions";
import { tvImageKey } from "@/lib/pra-wam/tv";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { copyObject, isR2Configured, presignDownload, readObject, removeObjects } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { writeXlsx } from "../xlsx-write";
import { listPeople } from "./appraisal";
import { sessionsByIds } from "./sessions";
import { addMeetingPicture } from "./tv";

/*
 * Arsip MoM (12 Nov 2026), for any admin of Admin WAM: every sent MoM, read in a few queries for
 * all of them, with its numbers, its photos and whether a photo is on the TV. Its PDF is the one
 * Telegram gets (minutesForConsole); its photos are given as they are kept (Full HD); a photo can
 * be copied to the TV as a picture. A draft never shows here: it is only for those in the meeting.
 */

type Row = {
  session_id: string; summary: string; decisions: string; submitted_by: string | null; submitted_at: string;
  sent_at?: string | null; version?: number; telegram_off?: boolean;
  number?: number | null; doc_number?: string | null; chair_id?: string | null; items?: unknown; absent_ids?: string[] | null; guests?: string | null;
};
type ActionRow = { session_id: string; sort_order: number; task: string; pic_id: string | null; pic_ids?: string[] | null; due_date: string | null; done: boolean };
type PhotoRow = { id: string; session_id: string; file_key: string; size: number; width: number | null; height: number | null; created_at: string };

const BASE = "session_id,summary,decisions,submitted_by,submitted_at";
const SEND = `${BASE},sent_at,version,telegram_off`;
const FRM = `${SEND},number,chair_id,items,absent_ids,guests`;
/** With the nomor surat MoM (migration 202611130001). */
const DOC = `${FRM},doc_number`;
const tableMissing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "");
const columnMissing = (error: { code?: string; message?: string }) => ["42703", "PGRST204"].includes(error.code ?? "") || /column .* does not exist|Could not find the .* column/.test(error.message ?? "");

/** Runs a read a hundred ids at a time (an address holds only so many). */
async function inParts<T>(ids: readonly string[], read: (part: string[]) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<{ rows: T[]; error: { code?: string; message: string } | null }> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await read(ids.slice(start, start + 100));
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
  }
  return { rows, error: null };
}

/** The sent MoMs (every saved one before drafts existed), with as many columns as the migrations allow. */
async function sentRows(ids: readonly string[] | null): Promise<{ migrated: boolean; sending: boolean; rows: Row[] }> {
  const client = createPrivilegedClient();
  for (const [columns, sending] of [[DOC, true], [FRM, true], [SEND, true], [BASE, false]] as const) {
    const query = (part: string[] | null) => {
      let select = client.from("pw_session_minutes").select(columns);
      if (sending) select = select.not("sent_at", "is", null);
      return (part ? select.in("session_id", part) : select).order("submitted_at", { ascending: false }).limit(2000);
    };
    const { rows, error } = ids ? await inParts<Row>(ids, query) : await query(null).then(({ data, error: readError }) => ({ rows: (data ?? []) as unknown as Row[], error: readError }));
    if (!error) return { migrated: true, sending, rows };
    if (tableMissing(error)) return { migrated: false, sending, rows: [] };
    if (!columnMissing(error)) databaseError(error);
  }
  return { migrated: false, sending: false, rows: [] };
}

function asItems(value: unknown): MinuteItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && typeof (item as { topic?: unknown }).topic === "string")
    .map(item => ({ topic: String(item.topic), discussion: typeof item.discussion === "string" ? item.discussion : "", decision: typeof item.decision === "string" ? item.decision : "", added: item.added === true }));
}

type Detail = { items: MinuteItem[]; actions: { task: string; pic: string | null; dueDate: string | null; done: boolean }[]; absent: string[]; present: string[]; guests: string[]; session: Session };
type Loaded = CabinetView & { details: Map<string, Detail> };

/** Every sent MoM (or those of `ids`), newest first. */
async function load(ids: readonly string[] | null): Promise<Loaded> {
  const { migrated, sending, rows } = await sentRows(ids);
  if (!migrated || !rows.length) return { migrated, tvReady: await tvReady(), entries: [], details: new Map() };
  const client = createPrivilegedClient();
  const sessionIds = rows.map(row => row.session_id);
  const [sessions, people, actions, photos, onTv, links, files] = await Promise.all([
    sessionsByIds(sessionIds), listPeople(),
    // Every PIC of a follow-up (migration 202611130003); before it, the one.
    inParts<ActionRow>(sessionIds, part => client.from("pw_session_minute_actions").select("session_id,sort_order,task,pic_id,pic_ids,due_date,done").in("session_id", part).order("sort_order"))
      .then(result => result.error && /pic_ids/.test(result.error.message) ? inParts<ActionRow>(sessionIds, part => client.from("pw_session_minute_actions").select("session_id,sort_order,task,pic_id,due_date,done").in("session_id", part).order("sort_order")) : result),
    inParts<PhotoRow>(sessionIds, part => client.from("pw_session_minute_photos").select("id,session_id,file_key,size,width,height,created_at").in("session_id", part).order("created_at")),
    client.from("pw_tv_slides").select("mom_photo_id").not("mom_photo_id", "is", null),
    inParts<{ session_id: string; employee_id: string }>(sessionIds, part => client.from("pw_session_participants").select("session_id,employee_id").in("session_id", part)),
    // The MoMs uploaded as a file (migration 202611130004); none before it.
    inParts<{ session_id: string; name: string; size: number; content_type: string }>(sessionIds, part => client.from("pw_session_minute_files").select("session_id,name,size,content_type").in("session_id", part)),
  ]);
  const fileOf = new Map((files.error ? [] : files.rows).map(row => [row.session_id, { name: row.name, size: row.size, type: row.content_type }]));
  if (actions.error && !tableMissing(actions.error)) databaseError(actions.error);
  const bySession = new Map(sessions.map(session => [session.id, session]));
  const name = (id: string | null | undefined) => (id ? people.find(person => person.id === id)?.name ?? "Tanpa nama" : null);
  const fullName = (id: string) => { const person = people.find(each => each.id === id); return person?.fullName ?? person?.name ?? "Tanpa nama"; };
  const tv = new Set(onTv.error ? [] : (onTv.data ?? []).map(row => row.mom_photo_id as string));

  // The department a MoM is filed under: the booker's (first of their departments), the HOD group's for a Meeting HOD.
  const bookers = [...new Set(sessions.map(session => session.booking?.bookedBy.id).filter((id): id is string => !!id))];
  const bookings = [...new Set(sessions.map(session => session.booking?.id).filter((id): id is string => !!id))];
  const [staff, jobs, hods] = await Promise.all([
    inParts<{ id: string; department: string | null }>(bookers, part => client.from("employees").select("id,department").in("id", part)),
    inParts<{ employee_id: string; department: string | null; sort_order: number }>(bookers, part => client.from("employee_jobs").select("employee_id,department,sort_order").in("employee_id", part).order("sort_order")),
    inParts<{ booking_id: string }>(bookings, part => client.from("pw_hod_meetings").select("booking_id").in("booking_id", part).neq("status", "batal")),
  ]);
  const departmentOf = (employeeId: string | undefined) => {
    if (!employeeId) return null;
    const own = staff.rows.find(row => row.id === employeeId)?.department?.trim();
    return own || jobs.rows.find(row => row.employee_id === employeeId && row.department?.trim())?.department?.trim() || null;
  };
  const hodBookings = new Set(hods.error ? [] : hods.rows.map(row => row.booking_id));

  const entries: CabinetEntry[] = [];
  const details = new Map<string, Detail>();
  for (const row of rows) {
    const session = bySession.get(row.session_id);
    if (!session) continue;
    const day = session.startsAt ? wibDate(session.startsAt) : wibDate(row.submitted_at);
    const hod = !!session.booking && hodBookings.has(session.booking.id);
    const owner = departmentOf(session.booking?.bookedBy.id);
    const department = hod ? "Meeting HOD" : owner ?? "WAM Werkudara";
    const short = hod ? "HOD" : owner ? departmentShorts([owner]).get(owner) ?? owner : "WAM";
    const items = asItems(row.items);
    const own = (actions.rows ?? []).filter(action => action.session_id === row.session_id);
    const inMeeting = links.rows.filter(link => link.session_id === row.session_id).map(link => link.employee_id);
    const away = new Set((row.absent_ids ?? []).filter(id => inMeeting.includes(id)));
    const guests = guestNames(row.guests);
    const pictures: CabinetPhoto[] = (photos.error ? [] : photos.rows).filter(photo => photo.session_id === row.session_id)
      .map(photo => ({ id: photo.id, width: photo.width, height: photo.height, size: photo.size, at: photo.created_at, onTv: tv.has(photo.id) }));
    // The nomor surat typed (13 Nov 2026), else the automatic number, else the code.
    const docNumber = row.doc_number?.trim() || null;
    const number = docNumber ?? (row.number ? minutesNumber(row.number, day) : null);
    entries.push({
      sessionId: session.id, code: number ?? minutesCode(short, day, session.id), numbered: !!number,
      title: session.title, date: day,
      from: session.startsAt ? wibTime(session.startsAt).replace(":", ".") : null, to: session.endsAt ? wibTime(session.endsAt).replace(":", ".") : null,
      place: session.roomName ?? session.location ?? "", department, short, hod,
      chair: name(row.chair_id), notetaker: name(row.submitted_by),
      present: inMeeting.length - away.size, total: inMeeting.length, guests: guests.length,
      topics: items.length || (row.summary.trim() ? 1 : 0), decisions: decisionCount({ decisions: row.decisions, items }),
      actions: own.length, open: own.filter(action => !action.done).length,
      version: sending ? Math.max(1, row.version ?? 1) : 1, sentAt: (sending ? row.sent_at : null) ?? row.submitted_at, telegramOff: !!row.telegram_off,
      photos: pictures, file: fileOf.get(session.id) ?? null,
    });
    details.set(session.id, {
      session, absent: [...away].map(fullName), present: inMeeting.filter(id => !away.has(id)).map(fullName), guests,
      items: items.length ? items : [{ topic: session.title, discussion: row.summary, decision: row.decisions, added: false }],
      actions: own.map(action => ({
        task: action.task, dueDate: action.due_date, done: action.done,
        pic: (action.pic_ids?.length ? action.pic_ids : action.pic_id ? [action.pic_id] : []).map(id => name(id)).join(", ") || null,
      })),
    });
  }
  entries.sort((a, b) => `${b.date}${b.from ?? ""}`.localeCompare(`${a.date}${a.from ?? ""}`));
  return { migrated: true, tvReady: !onTv.error, entries, details };
}

/** Migration 202611120006: a TV picture can remember the meeting photo it came from. */
async function tvReady(): Promise<boolean> {
  const { error } = await createPrivilegedClient().from("pw_tv_slides").select("mom_photo_id").limit(1);
  return !error;
}

/** Arsip MoM: every sent MoM, newest first. */
export async function momCabinet(): Promise<CabinetView> {
  const { migrated, tvReady: ready, entries } = await load(null);
  return { migrated, tvReady: ready, entries };
}

/** Excel rekap of these MoMs: one sheet of MoMs, one of agenda items and new topics, one of action items. */
export async function cabinetWorkbook(ids: readonly string[]): Promise<Buffer> {
  const { entries, details } = await load(ids);
  if (!entries.length) throw new ServiceError(404, "MoM yang dipilih tidak ditemukan atau belum dikirim.");
  const placed = placeEntries(entries);
  const yesNo = (value: boolean) => (value ? "Ya" : "Tidak");
  const moms: string[][] = [[
    "No. MoM", "Tanggal", "Mulai", "Selesai", "Meeting", "Kegiatan", "Departemen", "Location/Platform", "Chairperson", "Minute Taker",
    "Hadir", "Tidak hadir", "Peserta lain", "Topik", "Keputusan", "Tindak lanjut", "Belum selesai (Open)", "Foto", "Versi", "Dikirim (WIB)", "Telegram", "Folder", "Berkas MoM",
  ]];
  const agenda: string[][] = [["No. MoM", "Tanggal", "Meeting", "Bagian", "#", "Topic", "Discussion Summary & Key Points", "Decisions/Outcomes"]];
  const actionRows: string[][] = [["No. MoM", "Tanggal", "Meeting", "#", "Action Item/Task", "PIC", "Due Date", "Status"]];
  for (const entry of placed) {
    const detail = details.get(entry.sessionId)!;
    moms.push([
      entry.code, entry.date, entry.from ?? "", entry.to ?? "", entry.title, activityOf(entry.title, entry.short), entry.department, entry.place,
      entry.chair ?? "", entry.notetaker ?? "", detail.present.join(", "), detail.absent.join(", "), detail.guests.join(", "),
      String(entry.topics), String(entry.decisions), String(entry.actions), String(entry.open), String(entry.photos.length), String(entry.version),
      `${wibDate(entry.sentAt)} ${wibTime(entry.sentAt)}`, entry.telegramOff ? "Tidak dikirim (dipilih notulis)" : yesNo(true), entry.path.join(" / "),
      entry.file?.name ?? "",
    ]);
    const parts = [detail.items.filter(item => !item.added), detail.items.filter(item => item.added)];
    parts.forEach((list, part) => list.forEach((item, index) => agenda.push([
      entry.code, entry.date, entry.title, part ? "IV. New Items/Topics" : "III. Agenda Items", String(index + 1), item.topic, item.discussion, decisionLines(item.decision).join("\n"),
    ])));
    detail.actions.forEach((action, index) => actionRows.push([
      entry.code, entry.date, entry.title, String(index + 1), action.task, action.pic ?? "", action.dueDate ? frmDue(action.dueDate) : "", action.done ? "Done" : "Open",
    ]));
  }
  return writeXlsx([
    { name: "MoM", rows: moms, widths: [20, 12, 8, 8, 34, 22, 26, 22, 20, 20, 40, 30, 24, 8, 10, 12, 12, 8, 7, 18, 16, 60] },
    { name: "Agenda", rows: agenda, widths: [20, 12, 30, 20, 5, 30, 60, 50] },
    { name: "Tindak lanjut", rows: actionRows, widths: [20, 12, 30, 5, 50, 22, 12, 9] },
  ]);
}

type ConsolePhoto = { id: string; session_id: string; file_key: string };
/** A photo of a sent MoM, or 404. */
async function sentPhoto(photoId: string): Promise<ConsolePhoto> {
  if (!isR2Configured()) throw new ServiceError(404, "Foto tidak ditemukan.");
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_session_minute_photos").select("id,session_id,file_key").eq("id", photoId).maybeSingle();
  if (error) { if (tableMissing(error)) throw new ServiceError(404, "Foto tidak ditemukan."); databaseError(error); }
  if (!data) throw new ServiceError(404, "Foto tidak ditemukan.");
  const { rows } = await sentRows([data.session_id as string]);
  if (!rows.length) throw new ServiceError(404, "Foto tidak ditemukan.");
  return data as ConsolePhoto;
}

/** A short-lived storage address of a photo; with `filename`, one that downloads it under that name. */
export async function cabinetPhotoAddress(photoId: string, filename?: string): Promise<string> {
  const photo = await sentPhoto(photoId);
  return presignDownload(photo.file_key, { seconds: 75 * 60, ...(filename ? { filename } : {}) });
}

/** A photo's bytes, for a zip put together in the admin's browser (each at most 1 MB). */
export async function cabinetPhotoFile(photoId: string): Promise<Uint8Array> {
  const photo = await sentPhoto(photoId);
  const object = await readObject(photo.file_key);
  if (!object) throw new ServiceError(404, "Foto tidak ada lagi di penyimpanan.");
  return object.bytes;
}

/**
 * Galeri → Masukkan ke TV: each photo as Tampilkan di TV does, in order. A photo already on the TV
 * is passed over; when the TV is full the rest stay out. Says how many went in.
 */
export async function cabinetPhotosToTv(photos: readonly { id: string; title: string }[]): Promise<{ added: number; already: number; left: number }> {
  let added = 0, already = 0;
  for (const [index, photo] of photos.entries()) {
    try { await cabinetPhotoToTv(photo.id, photo.title); added += 1; }
    catch (error) {
      if (error instanceof ServiceError && error.status === 409 && /sudah ada di TV/.test(error.message)) { already += 1; continue; }
      if (error instanceof ServiceError && error.status === 409) return { added, already, left: photos.length - index };
      if (added || already) return { added, already, left: photos.length - index };
      throw error;
    }
  }
  return { added, already, left: 0 };
}

/** Tampilkan di TV: the photo, copied to the TV's storage, becomes a picture of the playlist (last, shown). */
export async function cabinetPhotoToTv(photoId: string, title: string): Promise<void> {
  if (!(await tvReady())) throw new ServiceError(503, `Foto meeting di TV menunggu migrasi ${MOM_CABINET_MIGRATION}.`);
  const photo = await sentPhoto(photoId);
  const { data: already } = await createPrivilegedClient().from("pw_tv_slides").select("id").eq("mom_photo_id", photo.id).limit(1);
  if (already?.length) throw new ServiceError(409, "Foto ini sudah ada di TV. Atur atau hapus di TV Announcement.");
  const key = tvImageKey(randomUUID(), "image/jpeg");
  await copyObject(photo.file_key, key, "image/jpeg");
  try { await addMeetingPicture(key, title, photo.id); }
  catch (error) { await removeObjects([key]).catch(() => undefined); throw error; }
}
