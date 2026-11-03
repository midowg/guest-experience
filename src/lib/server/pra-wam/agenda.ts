import "server-only";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { sessionKindLabels, sessionWhere } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { createPrivilegedClient } from "../supabase/admin";
import { myBookings } from "./appraisal";
import type { Member } from "./session";
import { listSessions } from "./sessions";

/*
 * The person's own day-by-day list for Beranda and Agenda: published sessions they take part in
 * and their appraisal bookings, from today on, with whether they have checked in.
 */

export type AgendaItem = {
  key: string; kind: "sesi" | "appraisal"; startsAt: string; endsAt: string; title: string; href: string;
  tag: string; where: string; sessionId: string | null; checkedInAt: string | null;
};

export async function agendaItems(member: Member, today: string): Promise<{ items: AgendaItem[]; migrated: boolean }> {
  const [{ sessions, migrated }, bookings] = await Promise.all([listSessions(member), myBookings(member, today).catch(() => [])]);
  const mine = sessions.filter(session => session.status === "terbit" && session.isParticipant && session.startsAt && session.endsAt && wibDate(session.startsAt) >= today);
  const checkIns = new Map<string, string>();
  if (mine.length) {
    const { data } = await createPrivilegedClient().from("pw_attendance").select("session_id,checked_in_at").eq("employee_id", member.id).in("session_id", mine.map(session => session.id));
    for (const row of data ?? []) checkIns.set(row.session_id, row.checked_in_at);
  }
  const items: AgendaItem[] = [
    ...mine.map(session => ({
      key: session.id, kind: "sesi" as const, startsAt: session.startsAt!, endsAt: session.endsAt!, title: session.title, href: praWamPath.session(session.id),
      tag: sessionKindLabels[session.kind], where: sessionWhere(session), sessionId: session.id, checkedInAt: checkIns.get(session.id) ?? null,
    })),
    ...bookings.map(booking => ({
      key: booking.id, kind: "appraisal" as const, startsAt: booking.startsAt, endsAt: booking.endsAt, title: booking.title, href: praWamPath.appraisal(wibDate(booking.startsAt)),
      tag: "Appraisal", where: booking.bookedBy.id === member.id ? "Booking kamu" : `Bersama ${booking.bookedBy.name}`, sessionId: null, checkedInAt: null,
    })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { items, migrated };
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
