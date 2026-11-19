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

/**
 * Agenda (P03, revisi 16 Nov; laid out after the handbook's rundown): the four days (today marked;
 * the chosen day in the address, so Back and a reload keep it), the day's header ("Hari 2 · Sel,
 * 5 Jan", how many sessions), then a timeline: hours, kind of entry, title, place; the running one
 * lit with "Sedang berlangsung", the next marked "Berikutnya", a moved one "Jam berubah", a
 * cancelled one struck through and not openable. A row opens Detail sesi.
 */
export function AgendaScreen({ migrated, days, day, rows, anyPublished, since, forceOffline }: {
  migrated: boolean; days: AgendaDayTab[]; day: number; rows: AgendaRow[]; anyPublished: boolean; since: string; forceOffline?: boolean;
}) {
  const t = useT();
  const current = days.find(item => item.number === day);
  const prev = day > 1 ? mainWamPath.agenda(day - 1) : null;
  const next = day < days.length ? mainWamPath.agenda(day + 1) : null;
  return <ScreenContent>
    <div className={css.dayBar}>
      <DayTabs className={css.dayTabs} current={String(day)} days={days.map(item => ({ key: item.key, day: item.day, date: item.date, today: item.today, href: mainWamPath.agenda(item.number) }))} />
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
