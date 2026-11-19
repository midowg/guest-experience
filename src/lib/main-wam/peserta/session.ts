import { t, type Lang } from "../i18n";
import { hasEnded, isRunning, timeRange } from "../rundown";
import type { LineupItem, MwSession, RundownChange } from "../types";
import { dayOf, hhmm } from "./format";
import { agendaKind, movedInRundown, timeChange, type AgendaKind } from "./agenda";

/*
 * Detail sesi (P04, revisi 16 Nov malam): the pill, title, day and hours, place (+ Denah),
 * dresscode, "Yang perlu dibawa" (text, no ticking), and "Info lainnya" folded: urutan tampil,
 * konsumsi, kontak panitia. Absen, the module's action and the photos are other areas' slots. Pure.
 */

export type SessionView = {
  id: string;
  title: string;
  status: "upcoming" | "live" | "done" | "cancelled";
  kind: AgendaKind;
  /** "Sel, 5 Jan · 08.00–12.00". */
  when: string;
  /** "4 jam", "45 menit", "1 jam 30 menit"; empty for a moment without an end. */
  length: string;
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

/** How long it lasts, said plainly ("4 jam", "1 jam 30 menit"); empty without an end. */
function lengthOf(session: MwSession, lang: Lang): string {
  if (!session.endsAt) return "";
  const minutes = Math.round((Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60_000);
  if (!(minutes > 0)) return "";
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? t(lang, "peserta.session.lenHours", { n: hours }) : "", rest ? t(lang, "peserta.session.lenMinutes", { n: rest }) : ""].filter(Boolean).join(" ");
}

export function sessionView(session: MwSession, now: Date, log: readonly RundownChange[], hasContact: boolean, lang: Lang = "id"): SessionView {
  const cancelled = session.status === "batal";
  const moved = !cancelled && movedInRundown(session, log);
  const exact = moved ? timeChange(session, log, lang) : null;
  const lineup = session.lineup.filter(item => item.label.trim());
  const meal = session.meal.trim();
  const parts = [lineup.length ? t(lang, "peserta.session.infoOrder") : "", meal ? t(lang, "peserta.session.infoMeal") : "", hasContact ? t(lang, "peserta.session.infoCommittee") : ""].filter(Boolean);
  const infoSub = parts.join(", ");
  return {
    id: session.id,
    title: session.title,
    status: cancelled ? "cancelled" : isRunning(session, now) ? "live" : hasEnded(session, now) ? "done" : "upcoming",
    kind: agendaKind(session),
    length: lengthOf(session, lang),
    when: `${dayOf(session.startsAt, lang)} · ${timeRange(session, lang)}`,
    place: session.place.trim(),
    dresscode: session.dresscode.trim(),
    bring: session.bring.trim(),
    description: session.description.trim(),
    change: !moved ? null : exact ? exact.text : session.changedAt ? t(lang, "peserta.session.changedAt", { time: hhmm(session.changedAt, lang) }) : null,
    lineup,
    meal,
    infoSub: infoSub ? infoSub.charAt(0).toUpperCase() + infoSub.slice(1) : "",
  };
}
