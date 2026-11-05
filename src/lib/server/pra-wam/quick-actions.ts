import "server-only";
import { cache } from "react";
import { withItem } from "@/lib/pra-wam/agenda";
import { checkInNow } from "@/lib/pra-wam/attendance";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { praWamPath } from "@/lib/routes";
import { agendaItems } from "./agenda";
import { appraisalOpen } from "./events";
import type { Member } from "./session";

/** The person's agenda, read once per request: Beranda and the frame's Aksi cepat both ask. */
export const myAgenda = cache(agendaItems);

export type QuickActionData = {
  /** The session "Saya hadir" opens now (its detail over Beranda), or null when none is open. */
  checkIn: { title: string; href: string } | null;
  /** Whether Book ruang takes bookings now. */
  bookingOpen: boolean;
};

/**
 * What the blue + in the bottom bar offers this person now. Never in the way of a page: anything
 * that cannot be read simply leaves its action out or shows it as not available.
 */
export async function quickActionData(member: Member, now = new Date()): Promise<QuickActionData> {
  const [agenda, bookingOpen] = await Promise.all([
    myAgenda(member, wibDate(now.toISOString())).catch(() => null),
    appraisalOpen().catch(() => false),
  ]);
  const item = agenda ? checkInNow(agenda.items, now) : null;
  return { checkIn: item && { title: item.title, href: withItem(praWamPath.home, item.key) }, bookingOpen };
}
