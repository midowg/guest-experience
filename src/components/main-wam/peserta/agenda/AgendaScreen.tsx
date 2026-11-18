"use client";

import { CalendarDays, Hourglass } from "lucide-react";
import type { AgendaDayTab, AgendaRow } from "@/lib/main-wam/peserta/agenda";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { DayTabs, EmptyState, SessionList, SessionRow, StatusPill } from "@/components/main-wam/ui";
import { OfflineBanner } from "../Live";
import { DaySwipe } from "./DaySwipe";
import css from "../peserta.module.css";

/**
 * Agenda (P03, revisi 16 Nov): the four days (today marked; the chosen day in the address, so Back
 * and a reload keep it), then the day's sessions: time, title, place; the running one lit with
 * "Sedang berlangsung", a moved one "Jam berubah", a cancelled one struck through and not
 * openable. A row opens Detail sesi.
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
          : <SessionList label={current ? t("peserta.agenda.sessionsOf", { day: current.day, date: current.date }) : t("peserta.agenda.sessions")}>
            {rows.map(row => <SessionRow key={row.id} start={row.start} end={row.end || undefined} title={row.title} place={row.place || undefined}
              status={row.status} href={mainWamPath.session(row.id)} extra={row.changed ? <StatusPill status="changed" /> : undefined} />)}
          </SessionList>}
    </DaySwipe>
  </ScreenContent>;
}
