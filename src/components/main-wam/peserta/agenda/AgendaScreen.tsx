"use client";

import { CalendarDays, Hourglass } from "lucide-react";
import type { AgendaDayTab, AgendaRow } from "@/lib/main-wam/peserta/agenda";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { DayTabs, EmptyState, Pill } from "@/components/main-wam/ui";
import { OfflineBanner } from "../Live";
import { AgendaTimeline } from "./AgendaTimeline";
import { DaySwipe } from "./DaySwipe";
import css from "../peserta.module.css";
import own from "./agenda.module.css";

/** Where a tab goes: a day of the event (?hari=2) or a Persiapan day (?hari=h3). */
const tabHref = (item: AgendaDayTab) => (item.prep ? mainWamPath.agendaPrep(Number(item.key.slice(1))) : mainWamPath.agenda(item.number));

/**
 * Agenda (P03, revisi 16 Nov; laid out after the handbook's rundown): the four days (today marked;
 * the chosen day in the address, so Back and a reload keep it), the day's header ("Hari 2 · Sel,
 * 5 Jan", how many sessions), then a timeline: hours, kind of entry, title, place; the running one
 * lit with "Sedang berlangsung", the next marked "Berikutnya", a moved one "Jam berubah", a
 * cancelled one struck through and not openable. A row opens Detail sesi.
 */
export function AgendaScreen({ migrated, days, day, tab, rows, anyPublished, since, forceOffline }: {
  migrated: boolean; days: AgendaDayTab[]; day: number; /** The tab's key ("2", or "h3" for a Persiapan day); the day's number when left out. */ tab?: string;
  rows: AgendaRow[]; anyPublished: boolean; since: string; forceOffline?: boolean;
}) {
  const t = useT();
  const key = tab ?? String(day);
  const index = days.findIndex(item => item.key === key);
  const current = days[index];
  // Swiping goes through every tab in order, Persiapan days first.
  const prev = index > 0 ? tabHref(days[index - 1]) : null;
  const next = index >= 0 && index < days.length - 1 ? tabHref(days[index + 1]) : null;
  return <ScreenContent>
    <div className={css.dayBar}>
      <DayTabs className={css.dayTabs} current={key} days={days.map(item => ({ key: item.key, day: item.day, date: item.date, today: item.today, href: tabHref(item) }))} />
    </div>
    <OfflineBanner since={since} force={forceOffline} />
    <DaySwipe prev={prev} next={next} className={css.daySwipe}>
      {!migrated
        ? <EmptyState icon={<Hourglass />} title={t("peserta.waiting.title")}>{t("peserta.waiting.agenda")}</EmptyState>
        : !rows.length
          ? <EmptyState icon={<CalendarDays />} title={t("peserta.now.emptyTitle")}>{anyPublished ? undefined : t("peserta.now.emptySub")}</EmptyState>
          : <>
            {current && <div className={own.dayHead}>
              <h2 className={own.dayTitle}>{current.day} · {current.date}</h2>
              <p className={own.dayMeta}>
                {current.today && <Pill tone="primary">{t("fmt.today")}</Pill>}
                <span>{t("peserta.agenda.count", { n: rows.length })}</span>
              </p>
            </div>}
            <AgendaTimeline rows={rows} label={current ? t("peserta.agenda.sessionsOf", { day: current.day, date: current.date }) : t("peserta.agenda.sessions")} />
          </>}
    </DaySwipe>
  </ScreenContent>;
}
