"use client";

import { CalendarDays, Hourglass } from "lucide-react";
import type { AgendaDayTab, AgendaRow } from "@/lib/main-wam/peserta/agenda";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, ShellChrome } from "@/components/main-wam/shell";
import { EmptyState, EyebrowLabel, NetworkMotif } from "@/components/main-wam/ui";
import { OfflineBanner } from "../Live";
import { AgendaDayTabs } from "./AgendaDayTabs";
import { AgendaTimeline } from "./AgendaTimeline";
import { DaySwipe } from "./DaySwipe";
import css from "../peserta.module.css";
import own from "./agenda.module.css";

/** Where a tab goes: a day of the event (?hari=2) or a Persiapan day (?hari=h3). */
const tabHref = (item: AgendaDayTab) => (item.prep ? mainWamPath.agendaPrep(Number(item.key.slice(1))) : mainWamPath.agenda(item.number));

/**
 * Agenda (P03, prototipe final SC.agenda): the screen draws its own head, "AGENDA" over "HARI KE-2" (or
 * "PERSIAPAN") in big Barlow capitals (no bell: it is Beranda's alone), then the day tabs (the chosen day in the address, so
 * Back and a reload keep it; a big number over "Sel Jan", "H-3" over "1 Jan" for a Persiapan day, today
 * dotted), then a timeline: hours, a rail with a node, title, place and small tags (kind, "Wajib absen",
 * "Ceklis 0/2"); the running one lit gold with "Sedang berlangsung", the next marked "Berikutnya", a moved
 * one "Jam berubah", a cancelled one struck through and not openable. A row opens Detail sesi (a sheet).
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
  const title = current?.prep ? t("ceklis.tabPrep") : t("peserta.agenda.title", { n: current?.number ?? day });
  return <ScreenContent className={own.screen}>
    <ShellChrome hideTopBar />
    <NetworkMotif name="konstelasi" place="top" />
    <header className={own.head}>
      <div className={own.headText}>
        <EyebrowLabel>{t("peserta.agenda.eyebrow")}</EyebrowLabel>
        <h1 className={own.headTitle}>{title}</h1>
      </div>
    </header>
    <div className={css.dayBar}>
      <AgendaDayTabs className={css.dayTabs} current={key} days={days} hrefOf={tabHref} label={t("ui.eventDays")} />
    </div>
    <OfflineBanner since={since} force={forceOffline} />
    <DaySwipe prev={prev} next={next} className={css.daySwipe}>
      {!migrated
        ? <EmptyState icon={<Hourglass />} title={t("peserta.waiting.title")}>{t("peserta.waiting.agenda")}</EmptyState>
        : !rows.length
          ? <EmptyState icon={<CalendarDays />} title={t("peserta.now.emptyTitle")}>{anyPublished ? undefined : t("peserta.now.emptySub")}</EmptyState>
          : <AgendaTimeline rows={rows} label={current ? t("peserta.agenda.sessionsOf", { day: current.day, date: current.date }) : t("peserta.agenda.sessions")} />}
    </DaySwipe>
  </ScreenContent>;
}
