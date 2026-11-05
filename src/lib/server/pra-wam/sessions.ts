import "server-only";
import { cache } from "react";
import { clockLabel, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { BOOKING_SESSION_LOCKED, sessionProblems, sessionSpan, type RoomUse, type Session, type SessionInput, type SessionStatus } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, removeObjects } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { notifySession } from "./announcements";
import { listPeople, listRooms } from "./appraisal";
import { withBookingLink } from "./booking-sessions";
import { listEvents } from "./events";
import { type Member } from "./session";

/*
 * Sessions (migration 202611040004). Panitia and admin make and change them; BOD reads all;
 * a peserta sees the published sessions they take part in. A room is held for a session as long
 * as it is a draft or published, so a booking cannot take it and the other way round.
 */

const MIGRATION = "202611040004_pra_wam_sessions.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_sessions|pw_session_participants|pw_documents|pw_room_holds/.test(error.message ?? "");
export const sessionsWaiting = () => new ServiceError(503, `Sesi menunggu migrasi ${MIGRATION}.`);
function fail(error: { code?: string; message: string }): never {
  if (missing(error)) throw sessionsWaiting();
  databaseError(error);
}

type SessionRow = {
  id: string; title: string; kind: Session["kind"]; description: string; status: SessionStatus; plan_from: string | null; plan_to: string | null;
  starts_at: string | null; ends_at: string | null; room_id: string | null; location: string; created_by: string | null;
  /** Migration 202611050004; absent before it. */
  booking_id?: string | null;
};
const baseColumns = "id,title,kind,description,status,plan_from,plan_to,starts_at,ends_at,room_id,location,created_by";
/** With the booking link once migration 202611050004 is there (withBookingLink). */
const columns = (withLink: boolean) => withLink ? `${baseColumns},booking_id` : baseColumns;

/** The Pra WAM event sessions belong to. */
async function praWamEventId(): Promise<string> {
  const { events, migrated } = await listEvents();
  const event = events.find(item => item.kind === "pra_wam");
  if (!migrated || !event) throw new ServiceError(503, "Acara Pra WAM menunggu migrasi 202611040003_pra_wam_events_units.sql.");
  return event.id;
}

async function shape(rows: SessionRow[], viewer: Member): Promise<Session[]> {
  if (!rows.length) return [];
  const client = createPrivilegedClient();
  const [rooms, people, { data: links, error }] = await Promise.all([
    listRooms(), listPeople(),
    client.from("pw_session_participants").select("session_id,employee_id").in("session_id", rows.map(row => row.id)),
  ]);
  if (error) fail(error);
  const all = seesAllSessions(viewer);
  const byId = new Map(people.map(person => [person.id, { id: person.id, name: person.name, department: person.department }]));
  const person = (id: string) => byId.get(id) ?? { id, name: "Tanpa nama", department: "" };
  return rows.map(row => {
    const ids = (links ?? []).filter(link => link.session_id === row.id).map(link => link.employee_id);
    return {
      id: row.id, title: row.title, kind: row.kind, description: row.description, status: row.status,
      planFrom: row.plan_from, planTo: row.plan_to, startsAt: row.starts_at, endsAt: row.ends_at,
      roomId: row.room_id, roomName: rooms.find(room => room.id === row.room_id)?.name ?? null, location: row.location,
      participantCount: ids.length, isParticipant: ids.includes(viewer.id),
      participants: all ? ids.map(person).sort((a, b) => a.name.localeCompare(b.name)) : null,
      // The booker made it (created_by), so their name rides along.
      booking: row.booking_id ? { id: row.booking_id, bookedBy: person(row.created_by ?? "") } : null,
    };
  });
}

const order = (a: Session, b: Session) => (a.startsAt ?? `${a.planFrom ?? "9999"}T99`).localeCompare(b.startsAt ?? `${b.planFrom ?? "9999"}T99`);

/** Panitia, BOD and admin: every session. Anyone else: the published ones they take part in. */
async function listSessionsUncached(viewer: Member): Promise<{ sessions: Session[]; migrated: boolean }> {
  const client = createPrivilegedClient();
  let ids: string[] | null = null;
  if (!seesAllSessions(viewer)) {
    const { data: links, error } = await client.from("pw_session_participants").select("session_id").eq("employee_id", viewer.id);
    if (error) { if (missing(error)) return { sessions: [], migrated: false }; databaseError(error); }
    ids = (links ?? []).map(link => link.session_id as string);
    if (!ids.length) return { sessions: [], migrated: true };
  }
  const only = ids;
  const { data, error } = await withBookingLink(withLink => {
    const query = client.from("pw_sessions").select(columns(withLink));
    return (only ? query.eq("status", "terbit").in("id", only) : query).limit(500);
  });
  if (error) { if (missing(error)) return { sessions: [], migrated: false }; databaseError(error); }
  return { sessions: (await shape((data ?? []) as unknown as SessionRow[], viewer)).sort(order), migrated: true };
}
/** Read once per request, however many parts of the page ask. */
export const listSessions = cache(listSessionsUncached);

export async function getSession(id: string, viewer: Member): Promise<Session> {
  const { data, error } = await withBookingLink(withLink => createPrivilegedClient().from("pw_sessions").select(columns(withLink)).eq("id", id).maybeSingle());
  if (error) fail(error);
  const [session] = data ? await shape([data as unknown as SessionRow], viewer) : [];
  if (!session || (!seesAllSessions(viewer) && !(session.status === "terbit" && session.isParticipant))) throw new ServiceError(404, "Sesi tidak ditemukan.");
  return session;
}

/** Everything that holds a room on a day, with a label people recognise. */
export async function roomUses(date: string): Promise<RoomUse[]> {
  const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_room_holds").select("source,source_id,room_id,starts_at,ends_at")
    .lt("starts_at", wibInstant(next.toISOString().slice(0, 10), "00:00")).gt("ends_at", wibInstant(date, "00:00"));
  if (error) fail(error);
  const holds = data ?? [];
  const bookingIds = holds.filter(hold => hold.source === "booking").map(hold => hold.source_id);
  const sessionIds = holds.filter(hold => hold.source === "sesi").map(hold => hold.source_id);
  const [{ data: bookings }, { data: sessions }, people] = await Promise.all([
    bookingIds.length ? client.from("pw_room_bookings").select("id,title,booked_by").in("id", bookingIds) : Promise.resolve({ data: [] as { id: string; title: string; booked_by: string }[] }),
    sessionIds.length
      ? withBookingLink(withLink => client.from("pw_sessions").select(withLink ? "id,title,created_by,booking_id" : "id,title,created_by").in("id", sessionIds))
      : Promise.resolve({ data: [] }),
    listPeople(),
  ]);
  const named = (id: string | null | undefined, fallback: string) => people.find(person => person.id === id)?.name ?? fallback;
  const sessionRows = (sessions ?? []) as unknown as { id: string; title: string; created_by: string | null; booking_id?: string | null }[];
  return holds.map(hold => {
    const booking = bookings?.find(item => item.id === hold.source_id);
    const session = sessionRows.find(item => item.id === hold.source_id);
    // A booking's session holds the room instead of the booking (202611050004): named like a booking.
    const label = hold.source === "booking"
      ? `${booking?.title ?? "Booking ruang"} (${named(booking?.booked_by, "pemesan")})`
      : session?.booking_id ? `${session.title} (${named(session.created_by, "pemesan")})` : session?.title ?? "Sesi";
    return { roomId: hold.room_id, startsAt: hold.starts_at, endsAt: hold.ends_at, source: hold.source as RoomUse["source"], sourceId: hold.source_id, label };
  });
}

function requireManager(viewer: Member) {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa mengatur sesi.");
}

/** A taken room names what holds it, so panitia knows whom to talk to. */
async function roomTakenError(input: SessionInput, ignoreId?: string): Promise<ServiceError> {
  const span = sessionSpan(input)!;
  const uses = await roomUses(input.date);
  const use = uses.find(item => item.roomId === input.roomId && item.sourceId !== ignoreId && new Date(item.startsAt) < new Date(span.endsAt) && new Date(span.startsAt) < new Date(item.endsAt));
  return new ServiceError(409, use ? `Ruang sudah dipakai ${use.label}, ${clockLabel(wibTime(use.startsAt))}–${clockLabel(wibTime(use.endsAt))}.` : "Ruang sudah dipakai pada jam itu.", { roomId: ["Pilih ruang atau jam lain."] });
}

/** Creates or changes a session; `publish` also puts it on its participants' agenda. */
export async function saveSession(input: SessionInput, viewer: Member, options: { id?: string; publish?: boolean } = {}): Promise<Session> {
  requireManager(viewer);
  const current = options.id ? await getSession(options.id, viewer) : null;
  // Its time, room and people follow the booking; changing them here would split the two.
  if (current?.booking) throw new ServiceError(409, BOOKING_SESSION_LOCKED);
  const publish = options.publish ?? current?.status === "terbit";
  const problems = sessionProblems(input, publish);
  if (Object.keys(problems).length) throw new ServiceError(422, "Periksa kembali isian sesi.", Object.fromEntries(Object.entries(problems).map(([key, message]) => [key, [message]])));
  const span = sessionSpan(input);
  const values = {
    title: input.title, kind: input.kind, description: input.description,
    starts_at: span?.startsAt ?? null, ends_at: span?.endsAt ?? null, room_id: input.roomId || null, location: input.roomId ? "" : input.location,
    status: publish ? "terbit" : current?.status === "batal" ? "draf" : current?.status ?? "draf",
    ...(publish && current?.status !== "terbit" ? { published_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  };
  const client = createPrivilegedClient();
  const result = current
    ? await client.from("pw_sessions").update(values).eq("id", current.id).select("id").single()
    : await client.from("pw_sessions").insert({ ...values, event_id: await praWamEventId(), created_by: viewer.id }).select("id").single();
  if (result.error) {
    if (result.error.code === "23P01") throw await roomTakenError(input, current?.id);
    fail(result.error);
  }
  const id = result.data.id as string;
  const { error: clearError } = await client.from("pw_session_participants").delete().eq("session_id", id);
  if (clearError) fail(clearError);
  const people = [...new Set(input.participants)];
  if (people.length) {
    const { error } = await client.from("pw_session_participants").insert(people.map(employee_id => ({ session_id: id, employee_id })));
    if (error) { if (error.code === "23503") throw new ServiceError(422, "Ada peserta yang tidak dikenal. Muat ulang halaman."); fail(error); }
  }
  const saved = await getSession(id, viewer);
  // Participants hear about a session when it is published, and when a published one moves.
  if (saved.status === "terbit" && current?.status !== "terbit") await notifySession(saved, "terbit", viewer);
  else if (saved.status === "terbit" && current && (current.startsAt !== saved.startsAt || current.endsAt !== saved.endsAt || current.roomId !== saved.roomId || current.location !== saved.location)) await notifySession(saved, "berubah", viewer);
  return saved;
}

/** Back to draft (off the agenda) or cancelled (room freed, kept for the record). */
export async function setSessionStatus(id: string, status: Exclude<SessionStatus, "terbit">, viewer: Member): Promise<Session> {
  requireManager(viewer);
  const before = await getSession(id, viewer);
  const client = createPrivilegedClient();
  if (before.booking) {
    // Panitia may cancel a booking's session, which cancels the booking (the database does the
    // same from either side); cancelling the booking first records who did it.
    if (status !== "batal") throw new ServiceError(409, `${BOOKING_SESSION_LOCKED} Panitia hanya bisa membatalkannya.`);
    const stamp = new Date().toISOString();
    const { error } = await client.from("pw_room_bookings").update({ status: "batal", cancelled_by: viewer.id, cancelled_at: stamp, updated_at: stamp }).eq("id", before.booking.id).eq("status", "aktif");
    if (error) fail(error);
  }
  const { error } = await client.from("pw_sessions").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    if (error.code === "23P01") throw new ServiceError(409, "Ruang sesi ini sudah dipakai yang lain. Pilih ruang lain dulu.");
    fail(error);
  }
  const saved = await getSession(id, viewer);
  if (status === "batal" && before.status === "terbit") await notifySession(saved, "batal", viewer);
  return saved;
}

/**
 * Removes a draft or cancelled session for good, with its participants, attendance, requests,
 * documents (their files too) and the notifications about it, which would otherwise point nowhere.
 * A published session is cancelled first, so its participants hear.
 */
export async function deleteSession(id: string, viewer: Member): Promise<void> {
  requireManager(viewer);
  const session = await getSession(id, viewer);
  if (session.status === "terbit") throw new ServiceError(409, "Sesi yang sudah terbit dibatalkan dulu, baru bisa dihapus.");
  const client = createPrivilegedClient();
  const { data: files } = await client.from("pw_documents").select("file_key").eq("session_id", id);
  const keys = (files ?? []).map(file => file.file_key);
  if (keys.length && isR2Configured()) await removeObjects(keys).catch(() => undefined);
  // Before the announcements migration there is nothing to remove, so its error is not a failure.
  await client.from("pw_announcements").delete().eq("session_id", id);
  const { error } = await client.from("pw_sessions").delete().eq("id", id);
  if (error) fail(error);
}
