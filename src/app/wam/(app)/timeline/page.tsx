import { ChevronRight } from "lucide-react";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { TimelineCalendar } from "@/components/pra-wam/TimelineCalendar";
import { Notice } from "@/components/ui";
import { bookableDates, wibDate } from "@/lib/pra-wam/appraisal";
import { timelineMonths, type TimelineEntry } from "@/lib/pra-wam/timeline";
import { praWamPath } from "@/lib/routes";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { timelineItems } from "@/lib/server/pra-wam/sessions";
import css from "@/components/pra-wam/timeline.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timeline · WAM", robots: { index: false } };

/**
 * One forum or event: the dates (and the hours once published), the title, then one quiet line
 * with what else matters. Its colour is the dot on the rail, the same as its bar in the calendar.
 */
function Entry({ entry }: { entry: TimelineEntry }) {
  const opens = entry.published && entry.mine;
  const notes = [
    entry.kind === "acara" ? "Acara" : "Forum",
    entry.hours ?? (entry.state === "selesai" ? null : "Jadwal pasti menyusul"),
    entry.mine ? "Kamu ikut" : null,
  ].filter(Boolean).join(" · ");
  const body = <>
    <span className={css.when}>{entry.when}{entry.state === "berlangsung" && <span className={css.now}>Sedang berlangsung</span>}</span>
    <strong className={css.title}>{entry.title}</strong>
    <span className={css.meta}>{notes}</span>
  </>;
  return <li id={`t-${entry.id}`} className={`${css.entry} ${css[`c${entry.color}`]}`} data-state={entry.state}>
    <span className={css.dot} aria-hidden />
    {opens
      ? <a className={`${css.card} ${css.cardLink}`} href={praWamPath.session(entry.id)}>{body}<ChevronRight className={css.chevron} aria-hidden /></a>
      : <div className={css.card}>{body}</div>}
    {entry.state === "selesai" && <span className="sr-only">Selesai.</span>}
  </li>;
}

/**
 * Timeline (9 Nov 2026, in the bottom bar where Profil was): Pra WAM's forums and events from
 * Kelola acara → Jadwal sesi, month by month, so everyone sees the whole journey, not only their
 * own agenda. Read only; a published one the person takes part in opens its detail. Above the
 * list a month calendar (TimelineCalendar) draws each one as a bar in its own colour, the colour
 * its card carries below; a day a room can be booked on opens the booking page on it.
 */
export default async function TimelinePage() {
  const member = await requireMemberPage(praWamPath.timeline);
  const today = wibDate(new Date().toISOString());
  const [{ items, migrated }, open] = await Promise.all([timelineItems(member), appraisalOpen().catch(() => false)]);
  const months = timelineMonths(items, today);
  return <>
    <ScreenHead eyebrow="Pra WAM 2026" title="Timeline" lead="Forum dan acara Pra WAM dari panitia. Yang masih rencana menunggu jadwal pastinya." />
    {!migrated ? <Notice tone="warning">Timeline menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>
      : months.length === 0 ? <Notice tone="info">Panitia belum menyusun timeline. Cek lagi nanti.</Notice>
        : <div className={css.layout}>
          <TimelineCalendar entries={months.flatMap(month => month.entries)} today={today} bookable={open ? bookableDates(today) : []} />
          <div className={css.months}>
          {months.map(month => <section key={month.key} className={css.month} aria-labelledby={`bulan-${month.key}`}>
            <h2 id={`bulan-${month.key}`} className={css.monthName}>{month.label}</h2>
            <ol className={css.list}>{month.entries.map(entry => <Entry key={entry.id} entry={entry} />)}</ol>
          </section>)}
          </div>
        </div>}
  </>;
}
