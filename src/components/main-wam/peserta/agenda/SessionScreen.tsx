"use client";

import type { ReactNode } from "react";
import { CalendarClock, CircleX, Clock, MapPin, Shirt } from "lucide-react";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import type { SessionView } from "@/lib/main-wam/peserta/session";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, ScreenSection, Stack } from "@/components/main-wam/shell";
import { Banner, Button, SrOnly, StatusPill } from "@/components/main-wam/ui";
import { InfoLainnya } from "./InfoLainnya";
import css from "../peserta.module.css";
import info from "./info.module.css";

/**
 * Detail sesi (P04, revisi 16 Nov malam): a changed time or a cancellation on top, the pill (running
 * or done; nothing before it starts), title, day and hours, place with "Denah", dresscode, then the
 * modules' parts (agen D: Absen, the module's action; slots), "Yang perlu dibawa", and a card with
 * "Foto sesi ini" (agen B's slot) and "Info lainnya". A cancelled session keeps its facts but loses
 * absen and actions.
 */
export function SessionScreen({ view, contact, denahHref, slots, openInfo }: {
  view: SessionView;
  contact: Contact | null;
  /** The Denah guide; no button without one. */
  denahHref: string | null;
  slots: { absen?: ReactNode; action?: ReactNode; photos?: ReactNode };
  /** Previews: Info lainnya open. */
  openInfo?: boolean;
}) {
  const t = useT();
  const cancelled = view.status === "cancelled";
  return <ScreenContent>
    <Stack>
      {view.change && <Banner tone="warning" icon={<CalendarClock />} title={view.change} />}
      {cancelled && <Banner tone="error" icon={<CircleX />} title={t("peserta.session.cancelled")} />}
      {(view.status === "live" || view.status === "done") && <div className={css.pillRow}><StatusPill status={view.status} /></div>}
      <h2 className={css.sessionTitle}>{view.title}</h2>
      <div className={css.infoList}>
        <div className={css.infoRow}><Clock aria-hidden /><span>{view.when}</span></div>
        {view.place && <div className={css.infoRow}><MapPin aria-hidden /><span>{view.place}</span>
          {denahHref && <Button variant="text" size="m" href={denahHref} className={css.infoAction} aria-label={t("peserta.session.mapOf", { place: view.place })}>{t("peserta.session.map")}</Button>}
        </div>}
        {view.dresscode && <div className={css.infoRow}><Shirt aria-hidden /><span><SrOnly>{t("peserta.session.dresscodeSr")}</SrOnly>{view.dresscode}</span></div>}
      </div>
      {!cancelled && slots.absen}
      {!cancelled && slots.action}
    </Stack>
    {view.bring && <ScreenSection>
      <h3 className={css.groupHead}>{t("peserta.session.bring")}</h3>
      <p className={css.text}>{view.bring}</p>
    </ScreenSection>}
    <div className={info.list}>
      {slots.photos}
      {view.infoSub && <InfoLainnya sub={view.infoSub} lineup={view.lineup} meal={view.meal} contact={contact} defaultOpen={openInfo} />}
    </div>
  </ScreenContent>;
}

