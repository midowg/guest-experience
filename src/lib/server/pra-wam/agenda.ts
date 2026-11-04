import "server-only";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { sessionKindLabels, sessionWhere, type Session } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { myBookings } from "./appraisal";
import type { Member } from "./session";
import { listSessions } from "./sessions";

/*
 * The person's own day-by-day list for Beranda and Agenda: published sessions they take part in
 * and their appraisal bookings, from today on, with whether they have checked in and how many
 * documents each session has ("Bahan 3" in Penpot P2). Attendance (migration 202611040005) may
 * not be there yet; everything here keeps working without it.
 */

export type AgendaItem = {
  key: string; kind: "sesi" | "appraisal"; startsAt: string; endsAt: string; title: string; href: string;
  tag: string; where: string; sessionId: string | null; checkedInAt: string | null;
  /** Documents of the session (0 for a booking). */
  materials: number;
};

/** Attendance or its QR column is not in the database yet. */
const attendanceMissing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_attendance|qr_token/.test(error.message ?? "");

export async function agendaItems(member: Member, today: string): Promise<{ items: AgendaItem[]; migrated: boolean }> {
  const [{ sessions, migrated }, bookings] = await Promise.all([listSessions(member), myBookings(member, today).catch(() => [])]);
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
  const items: AgendaItem[] = [
    ...mine.map(session => ({
      key: session.id, kind: "sesi" as const, startsAt: session.startsAt!, endsAt: session.endsAt!, title: session.title, href: praWamPath.session(session.id),
      tag: sessionKindLabels[session.kind], where: sessionWhere(session), sessionId: session.id, checkedInAt: checkIns.get(session.id) ?? null,
      materials: materials.get(session.id) ?? 0,
    })),
    ...bookings.map(booking => ({
      key: booking.id, kind: "appraisal" as const, startsAt: booking.startsAt, endsAt: booking.endsAt, title: booking.title, href: praWamPath.appraisal(wibDate(booking.startsAt)),
      tag: "Book ruang", where: booking.bookedBy.id === member.id ? "Booking kamu" : `Bersama ${booking.bookedBy.name}`, sessionId: null, checkedInAt: null, materials: 0,
    })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { items, migrated };
}

/** The person's check-in for a session, and whether attendance exists at all yet. */
export async function myAttendance(sessionId: string, member: Member): Promise<{ ready: boolean; checkedInAt: string | null }> {
  const { data, error } = await createPrivilegedClient().from("pw_attendance").select("checked_in_at").eq("session_id", sessionId).eq("employee_id", member.id).maybeSingle();
  if (error) { if (attendanceMissing(error)) return { ready: false, checkedInAt: null }; databaseError(error); }
  return { ready: true, checkedInAt: data?.checked_in_at ?? null };
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

/** "25 menit lagi", "Sedang berlangsung", "Besok", or the day. */
export function untilLabel(item: Pick<AgendaItem, "startsAt" | "endsAt">, now: Date, today: string): string {
  const start = new Date(item.startsAt), end = new Date(item.endsAt);
  if (start <= now && end > now) return "Sedang berlangsung";
  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (wibDate(item.startsAt) === today) return minutes < 60 ? `${Math.max(minutes, 1)} menit lagi` : `${Math.round(minutes / 60)} jam lagi`;
  const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return wibDate(item.startsAt) === tomorrow.toISOString().slice(0, 10) ? "Besok" : "";
}
