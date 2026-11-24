"use client";

import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { CalendarCheck, CalendarDays, ChevronRight, CircleCheck, Clock, ListChecks, MapPin, QrCode, TrainFront, Utensils } from "lucide-react";
import type { NowView } from "@/lib/main-wam/peserta/home";
import type { SessionKind } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { BracketCard, Card, CardHead, EyebrowLabel, Pill, PulseDot, SrOnly } from "@/components/main-wam/ui";
import { Until } from "../Live";
import css from "./beranda.module.css";

/** The little tag at the top right of the card (prototipe .tag: Sesi, Makan, Santai, Kereta). */
const KIND_ICON = { sesi: <CalendarDays />, makan: <Utensils />, perjalanan: <TrainFront /> } satisfies Record<SessionKind, ReactElement>;

/**
 * Kartu Sekarang (P01, P01__status, P02; prototipe .mc): the session that matters now, as the gold
 * bracket card: its state in gold capitals ("SEDANG BERLANGSUNG"), the title in big Barlow capitals,
 * where and when, how far it has run, "WAJIB ABSEN · Tutup 08.30" beside the gold Absen button (agen D's
 * SessionAbsen, passed as `absen`) (the session that follows is its own card in the slide, "Akan datang"). Else "Hari
 * ini selesai" with tomorrow's first session. The title and place open Detail sesi; the Absen button
 * sits beside that link, never inside it.
 */
export function NowCard({ view, absen, serverNow, ceklis }: { view: NowView; absen?: ReactNode; serverNow: string; /** Module Ceklis: this agenda has a checklist that is not finished (one reminder line). */ ceklis?: { done: number; total: number } | null }) {
  const t = useT();
  if (view.kind === "kosong") {
    return <Card as="article">
      <CardHead icon={<CalendarDays />} title={t("peserta.now.emptyTitle")} sub={t("peserta.now.emptySub")} />
    </Card>;
  }
  if (view.kind === "selesai") {
    const next = view.tomorrow;
    return <Card as="article" href={mainWamPath.agenda(next?.day ?? undefined)}>
      <CardHead icon={<CalendarCheck />} iconTone="success" title={t("peserta.now.doneTitle")} sub={next ? `${next.when} · ${next.title}` : undefined}
        end={<ChevronRight aria-hidden className={css.chevron} />} />
    </Card>;
  }
  const live = view.status === "live";
  const eyebrow = view.status === "present"
    ? <EyebrowLabel tone="gold" icon={<CircleCheck />}>{view.statusText}</EyebrowLabel>
    : live
      ? <EyebrowLabel tone="gold"><PulseDot />{t("pill.live")}</EyebrowLabel>
      : view.status === "done"
        ? <EyebrowLabel tone="gold">{t("pill.done")}</EyebrowLabel>
        : <EyebrowLabel tone="gold"><PulseDot />{t("pill.next")}</EyebrowLabel>;
  const when = view.when && (view.status === "live" || view.status === "present" || !view.whenAt)
    ? view.when
    : view.when && view.whenAt ? <Until at={view.whenAt} serverNow={serverNow} initial={view.when} /> : null;
  const kind = view.sessionKind ?? "sesi";
  const place = [view.place, view.time].filter(Boolean).join(" · ");
  const percent = view.progress == null ? null : Math.round(view.progress * 100);
  return <BracketCard as="article" motif="konstelasi" className={css.now}>
    <div className={css.top}>
      <span className={css.state}>{eyebrow}{when && <><span aria-hidden>·</span><span className={css.when}>{when}</span></>}</span>
      <Pill icon={KIND_ICON[kind]}>{t(`peserta.session.kind.${kind}`)}</Pill>
    </div>
    <Link href={mainWamPath.session(view.sessionId)} className={css.link}>
      <h2 className={css.title}>{view.title}</h2>
      <SrOnly>{`, ${t("peserta.now.spokenDetail")}`}</SrOnly>
      <span className={css.meta}>
        <span className={css.metaItem}>{view.place ? <MapPin aria-hidden /> : <Clock aria-hidden />}<span>{place}</span></span>
        {ceklis && <span className={css.metaItem}><ListChecks aria-hidden /><span>{t("ceklis.homeReminder", { done: ceklis.done, total: ceklis.total })}</span></span>}
      </span>
    </Link>
    {percent !== null && <span className={css.bar} role="progressbar" aria-label={t("peserta.now.progress", { percent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></span>}
    {view.absen && absen && <div className={css.foot}>
      <div className={css.footText}>
        <EyebrowLabel tone="gold" icon={<QrCode />}>{t("peserta.now.absenRequired")}</EyebrowLabel>
        {view.absenCloses && <span className={css.footSub}>{t("peserta.now.absenCloses", { time: view.absenCloses })}</span>}
      </div>
      <div className={css.absen}>{absen}</div>
    </div>}
  </BracketCard>;
}

