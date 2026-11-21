"use client";

import type { ReactNode } from "react";
import { Backpack, CalendarClock, CircleX, Clock, MapPin, Shirt } from "lucide-react";
import type { ChecklistItemView } from "@/lib/main-wam/ceklis/ceklis";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import type { SessionView } from "@/lib/main-wam/peserta/session";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Banner, Button, IconBox, StatusPill } from "@/components/main-wam/ui";
import { Checklist } from "../ceklis/Checklist";
import { InfoLainnya } from "./InfoLainnya";
import { KIND_ICONS } from "./AgendaTimeline";
import css from "../peserta.module.css";
import info from "./info.module.css";
import own from "./agenda.module.css";

/** An agenda's checklist as Detail sesi draws it (module Ceklis; the data is the server's, SessionData.checklist). */
export type SessionChecklistProps = { sessionId: string; items: ChecklistItemView[]; required: boolean; sample?: boolean };

export type SessionBodyProps = {
  view: SessionView;
  contact: Contact | null;
  /** The Denah guide; no button without one. */
  denahHref: string | null;
  slots: { absen?: ReactNode; action?: ReactNode; photos?: ReactNode };
  /** The agenda's checklist (module Ceklis), when it has one. */
  checklist?: SessionChecklistProps | null;
  /** Previews: Info lainnya open. */
  openInfo?: boolean;
  /** The title as a heading of the body (the page); the sheet has it in its own header. */
  withTitle?: boolean;
};

/**
 * What Detail sesi holds (P04, revisi 16 Nov malam; after the handbook's detail card): a changed time or
 * a cancellation on top, the kind of entry and its pill (running or done; nothing before it starts),
 * title and description, a card with the time and the place ("Denah"), the checklist when the agenda
 * has one (module Ceklis), the modules' parts (agen D: Absen, the module's action; slots), soft cards
 * for dress code and "Yang perlu dibawa", and a card with "Foto sesi ini" (agen B's slot) and "Info
 * lainnya". A cancelled session keeps its facts but loses absen, actions and the checklist's ticking
 * stays (it is only a list). Shared by the sheet (the app) and the page (previews, tests).
 */
export function SessionBody({ view, contact, denahHref, slots, checklist, openInfo, withTitle = true }: SessionBodyProps) {
  const t = useT();
  const cancelled = view.status === "cancelled";
  const KindIcon = KIND_ICONS[view.kind];
  return <>
    <Stack>
      {view.change && <Banner tone="warning" icon={<CalendarClock />} title={view.change} />}
      {cancelled && <Banner tone="error" icon={<CircleX />} title={t("peserta.session.cancelled")} />}
      <div className={own.head}>
        <span className={own.kind}><span className={own.kindIcon} aria-hidden><KindIcon /></span>{t(`peserta.session.kind.${view.kind}`)}</span>
        {(view.status === "live" || view.status === "done") && <StatusPill status={view.status} />}
      </div>
      {withTitle && <h2 className={css.sessionTitle}>{view.title}</h2>}
      {view.description && <p className={own.lead}>{view.description}</p>}
      <div className={own.facts}>
        <div className={own.fact}>
          <IconBox icon={<Clock />} />
          <span className={own.factText}>
            <span className={own.factLabel}>{t("peserta.session.whenLabel")}</span>
            <span className={own.factValue}>{view.when}</span>
            {view.length && <span className={own.factSub}>{view.length}</span>}
          </span>
        </div>
        {view.place && <div className={own.fact}>
          <IconBox icon={<MapPin />} />
          <span className={own.factText}>
            <span className={own.factLabel}>{t("peserta.session.placeLabel")}</span>
            <span className={own.factValue}>{view.place}</span>
          </span>
          {denahHref && <Button variant="text" size="m" href={denahHref} className={own.factAction} aria-label={t("peserta.session.mapOf", { place: view.place })}>{t("peserta.session.map")}</Button>}
        </div>}
      </div>
      {checklist && checklist.items.length > 0 && <Checklist {...checklist} />}
      {!cancelled && slots.absen}
      {!cancelled && slots.action}
      {(view.dresscode || view.bring) && <div className={own.tips}>
        {view.dresscode && <section className={own.tip}><h3 className={own.tipHead}><Shirt aria-hidden />{t("peserta.session.dresscode")}</h3><p className={own.tipText}>{view.dresscode}</p></section>}
        {view.bring && <section className={own.tip}><h3 className={own.tipHead}><Backpack aria-hidden />{t("peserta.session.bring")}</h3><p className={own.tipText}>{view.bring}</p></section>}
      </div>}
    </Stack>
    <div className={info.list}>
      {slots.photos}
      {view.infoSub && <InfoLainnya sub={view.infoSub} lineup={view.lineup} meal={view.meal} contact={contact} defaultOpen={openInfo} />}
    </div>
  </>;
}

/** Detail sesi as a page (previews and tests; the app opens it as a sheet over Agenda, SessionSheet). */
export function SessionScreen(props: Omit<SessionBodyProps, "withTitle">) {
  return <ScreenContent><SessionBody {...props} /></ScreenContent>;
}
