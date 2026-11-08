import "server-only";
import { clockLabel, wibDate, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import { spanLabel, type RequestInput, type RequestStatus, type ScheduleRequest } from "@/lib/pra-wam/requests";
import { managesSessions } from "@/lib/pra-wam/roles";
import { BOOKING_SESSION_LOCKED } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { notifyPeople, notifySession } from "./announcements";
import { listPeople, listRooms } from "./appraisal";
import type { Member } from "./session";
import { getSession, roomUses } from "./sessions";

/*
 * Schedule change requests (migration 202611040007). Asking changes nothing; panitia approving
 * moves the session (the shared room holds still refuse a taken room), tells every participant,
 * and tells the person who asked. Declining tells the person why.
 */

const MIGRATION = "202611040007_pra_wam_schedule_requests.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_schedule_requests/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Ganti jadwal menunggu migrasi ${MIGRATION}.`);
function fail(error: { code?: string; message: string }): never {
  if (missing(error)) throw waiting();
  databaseError(error);
}

type Row = { id: string; session_id: string; employee_id: string; from_starts_at: string; from_ends_at: string; to_starts_at: string; to_ends_at: string; to_room_id: string | null; reason: string; status: RequestStatus; review_note: string; reviewed_at: string | null; created_at: string };
const columns = "id,session_id,employee_id,from_starts_at,from_ends_at,to_starts_at,to_ends_at,to_room_id,reason,status,review_note,reviewed_at,created_at";

async function shape(rows: Row[]): Promise<ScheduleRequest[]> {
  if (!rows.length) return [];
  const client = createPrivilegedClient();
  const [people, rooms, { data: sessions, error }] = await Promise.all([
    listPeople(), listRooms(),
    client.from("pw_sessions").select("id,title,starts_at").in("id", [...new Set(rows.map(row => row.session_id))]),
  ]);
  if (error) fail(error);
  return rows.map(row => {
    const session = sessions?.find(item => item.id === row.session_id);
    return {
      id: row.id, sessionId: row.session_id, sessionTitle: session?.title ?? "Sesi", requesterId: row.employee_id,
      requester: people.find(person => person.id === row.employee_id)?.name ?? "Tanpa nama",
      fromStartsAt: row.from_starts_at, fromEndsAt: row.from_ends_at, toStartsAt: row.to_starts_at, toEndsAt: row.to_ends_at,
      toRoomId: row.to_room_id, toRoomName: rooms.find(room => room.id === row.to_room_id)?.name ?? null,
      reason: row.reason, status: row.status, reviewNote: row.review_note, reviewedAt: row.reviewed_at, createdAt: row.created_at,
      stillCurrent: !!session?.starts_at && new Date(session.starts_at).getTime() === new Date(row.from_starts_at).getTime(),
    };
  });
}

/** A participant asks to move a published session. */
export async function requestChange(sessionId: string, input: RequestInput, member: Member): Promise<ScheduleRequest> {
  const session = await getSession(sessionId, member);
  if (!session.isParticipant) throw new ServiceError(403, "Hanya peserta sesi yang bisa mengajukan ganti jadwal.");
  if (session.booking) throw new ServiceError(409, `Sesi ini dari booking ruang ${session.booking.bookedBy.name}; minta pemesannya mengubah booking.`);
  if (session.status !== "terbit" || !session.startsAt || !session.endsAt) throw new ServiceError(409, "Sesi ini belum terbit atau belum punya jadwal.");
  if (new Date(session.endsAt) < new Date()) throw new ServiceError(409, "Sesi ini sudah lewat.");
  const toStartsAt = wibInstant(input.date, input.start), toEndsAt = wibInstant(input.date, input.end);
  if (new Date(toStartsAt) < new Date()) throw new ServiceError(422, "Jadwal usulan sudah lewat.", { start: ["Pilih jam yang belum lewat."] });
  if (new Date(toStartsAt).getTime() === new Date(session.startsAt).getTime() && new Date(toEndsAt).getTime() === new Date(session.endsAt).getTime() && (!input.roomId || input.roomId === session.roomId)) {
    throw new ServiceError(422, "Usulan sama dengan jadwal sekarang.");
  }
  const { data, error } = await createPrivilegedClient().from("pw_schedule_requests").insert({
    session_id: sessionId, employee_id: member.id, from_starts_at: session.startsAt, from_ends_at: session.endsAt,
    to_starts_at: toStartsAt, to_ends_at: toEndsAt, to_room_id: input.roomId || null, reason: input.reason,
  }).select(columns).single();
  if (error) {
    if (error.code === "23505") throw new ServiceError(409, "Kamu sudah punya permintaan yang menunggu untuk sesi ini. Tarik dulu bila ingin mengubahnya.");
    fail(error);
  }
  return (await shape([data as Row]))[0];
}

/** The person's own requests for a session (newest first). Empty before the migration. */
export async function myRequests(sessionId: string, member: Member): Promise<ScheduleRequest[]> {
  const { data, error } = await createPrivilegedClient().from("pw_schedule_requests").select(columns).eq("session_id", sessionId).eq("employee_id", member.id).order("created_at", { ascending: false }).limit(20);
  if (error) { if (missing(error)) return []; databaseError(error); }
  return shape((data ?? []) as Row[]);
}

export async function withdrawRequest(id: string, member: Member): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_schedule_requests").update({ status: "ditarik" }).eq("id", id).eq("employee_id", member.id).eq("status", "diajukan").select("id");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(404, "Permintaan tidak ditemukan atau sudah dijawab.");
}

/** Panitia: open requests first, then the latest answered. */
export async function allRequests(viewer: Member): Promise<{ open: ScheduleRequest[]; done: ScheduleRequest[]; migrated: boolean }> {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa meninjau permintaan jadwal.");
  const client = createPrivilegedClient();
  const [{ data: open, error }, { data: done, error: doneError }] = await Promise.all([
    client.from("pw_schedule_requests").select(columns).eq("status", "diajukan").order("created_at"),
    client.from("pw_schedule_requests").select(columns).neq("status", "diajukan").order("created_at", { ascending: false }).limit(30),
  ]);
  const problem = error ?? doneError;
  if (problem) { if (missing(problem)) return { open: [], done: [], migrated: false }; databaseError(problem); }
  return { open: await shape((open ?? []) as Row[]), done: await shape((done ?? []) as Row[]), migrated: true };
}

/** How many wait for panitia, for the menu. 0 before the migration. */
export async function openRequestCount(): Promise<number> {
  const { count, error } = await createPrivilegedClient().from("pw_schedule_requests").select("id", { count: "exact", head: true }).eq("status", "diajukan");
  return error ? 0 : count ?? 0;
}

/**
 * Panitia answers. Approving moves the session only if it is still where it was when asked, and
 * only into a free room; everyone in the session hears about the move.
 */
export async function reviewRequest(id: string, approve: boolean, note: string, viewer: Member): Promise<void> {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa meninjau permintaan jadwal.");
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_schedule_requests").select(columns).eq("id", id).eq("status", "diajukan").maybeSingle();
  if (error) fail(error);
  if (!data) throw new ServiceError(404, "Permintaan tidak ditemukan atau sudah dijawab.");
  const [request] = await shape([data as Row]);
  if (approve) {
    if (!request.stillCurrent) throw new ServiceError(409, "Jadwal sesi sudah berubah sejak permintaan ini diajukan. Tolak permintaan ini, atau ubah sesi langsung.");
    const session = await getSession(request.sessionId, viewer);
    if (session.booking) throw new ServiceError(409, `${BOOKING_SESSION_LOCKED} Tolak permintaan ini.`);
    const roomId = request.toRoomId ?? session.roomId;
    const { data: moved, error: moveError } = await client.from("pw_sessions")
      .update({ starts_at: request.toStartsAt, ends_at: request.toEndsAt, room_id: roomId, ...(roomId ? { location: "" } : {}), updated_at: new Date().toISOString() })
      .eq("id", request.sessionId).eq("starts_at", request.fromStartsAt).select("id");
    if (moveError) {
      if (moveError.code === "23P01") {
        const use = (await roomUses(wibDate(request.toStartsAt))).find(item => item.roomId === roomId && item.sourceId !== request.sessionId && new Date(item.startsAt) < new Date(request.toEndsAt) && new Date(request.toStartsAt) < new Date(item.endsAt));
        throw new ServiceError(409, use ? `Ruang pada jam usulan dipakai ${use.label}, ${clockLabel(wibTime(use.startsAt))}–${clockLabel(wibTime(use.endsAt))}. Tolak, atau ubah sesi ke ruang lain.` : "Ruang pada jam usulan sudah terpakai.");
      }
      fail(moveError);
    }
    if (!moved?.length) throw new ServiceError(409, "Jadwal sesi baru saja berubah. Muat ulang lalu tinjau lagi.");
    await notifySession(await getSession(request.sessionId, viewer), "berubah", viewer);
  }
  const { error: saveError } = await client.from("pw_schedule_requests")
    .update({ status: approve ? "disetujui" : "ditolak", reviewed_by: viewer.id, reviewed_at: new Date().toISOString(), review_note: note })
    .eq("id", id).eq("status", "diajukan");
  if (saveError) fail(saveError);
  await notifyPeople([request.requesterId], {
    title: `${approve ? "Disetujui" : "Ditolak"}: ganti jadwal ${request.sessionTitle}`,
    body: `${approve ? "Sesi dipindah ke" : "Usulan"} ${spanLabel(request.toStartsAt, request.toEndsAt)}.${note ? ` Catatan panitia: ${note}` : ""}`,
    sessionId: request.sessionId, topic: "permintaan", tag: `permintaan-${id}`,
  }, viewer);
}

/** The person's requests still waiting, for Beranda. Empty before the migration. */
export async function myOpenRequests(member: Member): Promise<ScheduleRequest[]> {
  const { data, error } = await createPrivilegedClient().from("pw_schedule_requests").select(columns).eq("employee_id", member.id).eq("status", "diajukan").order("created_at", { ascending: false }).limit(3);
  if (error) { if (missing(error)) return []; databaseError(error); }
  return shape((data ?? []) as Row[]);
}
