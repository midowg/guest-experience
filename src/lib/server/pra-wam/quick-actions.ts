import "server-only";
import { cache } from "react";
import { checkInNow, checkInWindow, windowState } from "@/lib/pra-wam/attendance";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { managesSessions } from "@/lib/pra-wam/roles";
import { agendaItems } from "./agenda";
import { appraisalOpen } from "./events";
import { listSessions } from "./sessions";
import type { Member } from "./session";

/** The person's agenda, read once per request: Beranda and the frame's Aksi cepat both ask. */
export const myAgenda = cache(agendaItems);

export type QuickActionData = {
  /** The person's session whose check-in is open now: "Saya hadir" opens its choice on Beranda. */
  checkIn: { title: string; closes: string } | null;
  /** Otherwise the next one still to open, so the row can say when. */
  upcoming: { title: string; opens: string } | null;
  /** Whether Book ruang takes bookings now. */
  bookingOpen: boolean;
  /** Panitia who run sessions: the published sessions whose check-in is open now, for Daftar hadir. */
  running: { id: string; title: string }[];
};

/**
 * What the blue + in the bottom bar offers this person now. Never in the way of a page: anything
 * that cannot be read simply leaves its action out or shows it as not available.
 */
export async function quickActionData(member: Member, now = new Date()): Promise<QuickActionData> {
  const [agenda, bookingOpen, all] = await Promise.all([
    myAgenda(member, wibDate(now.toISOString())).catch(() => null),
    appraisalOpen().catch(() => false),
    managesSessions(member) ? listSessions(member).then(result => result.sessions).catch(() => []) : Promise.resolve([]),
  ]);
  const items = agenda?.items ?? [];
  const open = checkInNow(items, now);
  const next = open ? null : items.find(item => item.kind === "sesi" && !item.checkedInAt && windowState(checkInWindow(item.startsAt, item.endsAt), now) === "belum");
  const running = all
    .filter(session => session.status === "terbit" && session.startsAt && session.endsAt && windowState(checkInWindow(session.startsAt, session.endsAt), now) === "buka")
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!))
    .slice(0, 3)
    .map(session => ({ id: session.id, title: session.title }));
  return {
    checkIn: open && { title: open.title, closes: checkInWindow(open.startsAt, open.endsAt).closes },
    upcoming: next ? { title: next.title, opens: checkInWindow(next.startsAt, next.endsAt).opens } : null,
    bookingOpen,
    running,
  };
}
