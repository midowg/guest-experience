import { hasEnded, isRunning, timeRange } from "../rundown";
import type { LineupItem, MwSession, RundownChange } from "../types";
import { dayOf, hhmm } from "./format";
import { movedInRundown, timeChange } from "./agenda";

/*
 * Detail sesi (P04, revisi 16 Nov malam): the pill, title, day and hours, place (+ Denah),
 * dresscode, "Yang perlu dibawa" (text, no ticking), and "Info lainnya" folded: urutan tampil,
 * konsumsi, kontak panitia. Absen, the module's action and the photos are other areas' slots. Pure.
 */

export type SessionView = {
  id: string;
  title: string;
  status: "upcoming" | "live" | "done" | "cancelled";
  /** "Sel, 5 Jan · 08.00–12.00". */
  when: string;
  place: string;
  dresscode: string;
  bring: string;
  description: string;
  /** Banner over the title: "Selesai 12.30, tadinya 12.00" (or "Jadwal diubah 10.20" when the log has no detail). */
  change: string | null;
  lineup: LineupItem[];
  meal: string;
  /** "Urutan, konsumsi, panitia": what Info lainnya holds; empty = no Info lainnya. */
  infoSub: string;
};

export function sessionView(session: MwSession, now: Date, log: readonly RundownChange[], hasContact: boolean): SessionView {
  const cancelled = session.status === "batal";
  const moved = !cancelled && movedInRundown(session, log);
  const exact = moved ? timeChange(session, log) : null;
  const lineup = session.lineup.filter(item => item.label.trim());
  const meal = session.meal.trim();
  const parts = [lineup.length ? "Urutan" : "", meal ? "konsumsi" : "", hasContact ? "panitia" : ""].filter(Boolean);
  const infoSub = parts.join(", ");
  return {
    id: session.id,
    title: session.title,
    status: cancelled ? "cancelled" : isRunning(session, now) ? "live" : hasEnded(session, now) ? "done" : "upcoming",
    when: `${dayOf(session.startsAt)} · ${timeRange(session)}`,
    place: session.place.trim(),
    dresscode: session.dresscode.trim(),
    bring: session.bring.trim(),
    description: session.description.trim(),
    change: !moved ? null : exact ? exact.text : session.changedAt ? `Jadwal diubah ${hhmm(session.changedAt)}` : null,
    lineup,
    meal,
    infoSub: infoSub ? infoSub.charAt(0).toUpperCase() + infoSub.slice(1) : "",
  };
}
