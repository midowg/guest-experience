import "server-only";
import type { AgendaBooking, MyAttendance, SessionView } from "@/lib/pra-wam/agenda";
import { asMethod } from "@/lib/pra-wam/attendance";
import { bookingWhere, wibDate } from "@/lib/pra-wam/appraisal";
import { bodOnly, managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { sessionKindLabels, sessionWhere, withoutSessionBookings, type Session } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listRooms, myBookings } from "./appraisal";
import { listDocuments } from "./documents";
import { proofColumnMissing } from "./attendance";
import { myRequests } from "./requests";
import type { Member } from "./session";
import { getSession, listSessions } from "./sessions";

/*
 * The person's own day-by-day list for Beranda and Agenda: published sessions they take part in
 * and their appraisal bookings, from today on, with whether they have checked in and how many
 * documents each session has ("Bahan 3" in Penpot P2). Attendance (migration 202611040005) may
 * not be there yet; everything here keeps working without it. An item opens over the page
 * (AgendaSheet): a booking with what it carries here, a session from its detail API. A booking
 * that is also a session (migration 202611050004) is listed once, as the session, still carrying
 * the booking so its booker can change or cancel it from there.
 */

export type AgendaItem = {
  key: string; kind: "sesi" | "appraisal"; startsAt: string; endsAt: string; title: string;
  tag: string; where: string; sessionId: string | null; checkedInAt: string | null;
  /** Documents of the session (0 for a booking). */
  materials: number;
  /** A booking's detail: of the booking itself, or of the booking a session was made from; null otherwise. */
  booking: AgendaBooking | null;
  /** The booking's id (the item's key for a booking, the session's booking for a session); null otherwise. */
  bookingId?: string | null;
};

/** Attendance or its QR column is not in the database yet. */
const attendanceMissing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_attendance|qr_token/.test(error.message ?? "");

export async function agendaItems(member: Member, today: string): Promise<{ items: AgendaItem[]; migrated: boolean }> {
  const [{ sessions, migrated }, bookings, rooms] = await Promise.all([
    listSessions(member), myBookings(member, today).catch(() => []), listRooms().catch(() => []),
  ]);
  const mine = sessions.filter(session => session.status === "terbit" && session.isParticipant && session.startsAt && session.endsAt && wibDate(session.startsAt) >= today);
  const checkIns = new Map<string, string>();
  const materials = new Map<string, number>();
  if (mine.length) {
    const client = createPrivilegedClient();
    const ids = mine.map(session => session.id);
    // Either table may be missing; then the list simply has no check-ins or counts.
    const [attendance, documents] = await Promise.all([
      client.from("pw_attendance").select("session_id,checked_in_at").eq("employee_id", member.id).in("session_id", ids),
      client.from("pw_documents").select("session_id").in("session_id", ids),
    ]);
    for (const row of attendance.data ?? []) checkIns.set(row.session_id, row.checked_in_at);
    for (const row of documents.data ?? []) materials.set(row.session_id, (materials.get(row.session_id) ?? 0) + 1);
  }
  const detail = (booking: (typeof bookings)[number]): AgendaBooking => ({
    room: bookingWhere(booking, rooms), bookedBy: booking.bookedBy,
    mine: booking.bookedBy.id === member.id, participants: booking.participants, description: booking.description,
  });
  const items: AgendaItem[] = [
    ...mine.map(session => {
      const booking = session.booking ? bookings.find(item => item.id === session.booking!.id) : undefined;
      return {
        key: session.id, kind: "sesi" as const, startsAt: session.startsAt!, endsAt: session.endsAt!, title: session.title,
        tag: sessionKindLabels[session.kind], where: sessionWhere(session), sessionId: session.id, checkedInAt: checkIns.get(session.id) ?? null,
        materials: materials.get(session.id) ?? 0, booking: booking ? detail(booking) : null, bookingId: session.booking?.id ?? null,
      };
    }),
    // A booking that is a session already shows as that session.
    ...withoutSessionBookings(bookings, mine).map(booking => {
      const shown = detail(booking);
      return {
        key: booking.id, kind: "appraisal" as const, startsAt: booking.startsAt, endsAt: booking.endsAt, title: booking.title,
        tag: "Book ruang", where: shown.room, sessionId: null, checkedInAt: null, materials: 0, booking: shown, bookingId: booking.id,
      };
    }),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { items, migrated };
}

/**
 * The person's check-in for a session and how it was made, whether attendance exists at all yet,
 * and whether "Saya hadir" does (its proof column, migration 202611050003).
 */
export async function myAttendance(sessionId: string, member: Member): Promise<MyAttendance> {
  const read = (columns: string) => createPrivilegedClient().from("pw_attendance").select(columns).eq("session_id", sessionId).eq("employee_id", member.id).maybeSingle();
  let selfReady = true;
  let { data, error } = await read("checked_in_at,method,proof_key");
  if (error && proofColumnMissing(error)) { selfReady = false; ({ data, error } = await read("checked_in_at,method")); }
  if (error) { if (attendanceMissing(error)) return { ready: false, checkedInAt: null, method: null, selfReady: false }; databaseError(error); }
  const row = data as { checked_in_at: string; method: string } | null;
  return { ready: true, checkedInAt: row?.checked_in_at ?? null, method: asMethod(row?.method), selfReady };
}

/**
 * A session the person takes part in but may not open yet (a draft, or cancelled): enough to say
 * so on its page instead of "not found", for a link from a notification or an old agenda.
 * Anything else, or any error, is null.
 */
export async function waitingSession(id: string, member: Member): Promise<Pick<Session, "id" | "title" | "status" | "planFrom" | "planTo" | "startsAt" | "endsAt"> | null> {
  const client = createPrivilegedClient();
  const [{ data: session, error }, { data: link, error: linkError }] = await Promise.all([
    client.from("pw_sessions").select("id,title,status,plan_from,plan_to,starts_at,ends_at").eq("id", id).maybeSingle(),
    client.from("pw_session_participants").select("employee_id").eq("session_id", id).eq("employee_id", member.id).maybeSingle(),
  ]);
  if (error || linkError || !session || !link || session.status === "terbit") return null;
  return { id: session.id, title: session.title, status: session.status, planFrom: session.plan_from, planTo: session.plan_to, startsAt: session.starts_at, endsAt: session.ends_at };
}

/**
 * Detail sesi's data (its page and the sheet over Agenda and Beranda). Panitia, BOD and admin may
 * open every session; a participant's session that is not published (yet) or was cancelled is
 * "menunggu". Null when the person may not see it at all.
 *
 * `from` (9 Nov 2026): panitia tools (Ubah sesi, QR dan daftar hadir, materi for any session) show
 * only when the session is opened from Kelola acara ("kelola"); in the participant app ("app") a
 * panitia member sees it as a participant does. A BOD keeps its read-only staff view everywhere.
 */
export async function sessionView(id: string, member: Member, from: "app" | "kelola" = "app"): Promise<SessionView | null> {
  const session = await getSession(id, member).catch((error: unknown) => { if (error instanceof ServiceError && error.status === 404) return null; throw error; });
  if (!session) {
    const waiting = await waitingSession(id, member);
    return waiting ? { kind: "menunggu", session: waiting } : null;
  }
  const [{ documents, storage }, attendance, requests, rooms] = await Promise.all([
    listDocuments(member, session.id).catch(() => ({ documents: [], migrated: false, storage: false })),
    session.isParticipant ? myAttendance(session.id, member) : Promise.resolve({ ready: false, checkedInAt: null, method: null, selfReady: false }),
    session.isParticipant ? myRequests(session.id, member) : Promise.resolve([]),
    listRooms(),
  ]);
  return {
    kind: "sesi", session, documents, storage, attendance, requests, rooms,
    viewer: {
      name: member.name,
      manage: from === "kelola" && managesSessions(member),
      staff: (from === "kelola" || bodOnly(member)) && seesAllSessions(member),
    },
  };
}

/** "25 menit lagi", "Sedang berlangsung", "Besok", or the day. */
export function untilLabel(item: Pick<AgendaItem, "startsAt" | "endsAt">, now: Date, today: string): string {
  const start = new Date(item.startsAt), end = new Date(item.endsAt);
  if (start <= now && end > now) return "Sedang berlangsung";
  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (wibDate(item.startsAt) === today) return minutes < 60 ? `${Math.max(minutes, 1)} menit lagi` : `${Math.round(minutes / 60)} jam lagi`;
  const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return wibDate(item.startsAt) === tomorrow.toISOString().slice(0, 10) ? "Besok" : "";
}
