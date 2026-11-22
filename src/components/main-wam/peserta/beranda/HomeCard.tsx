"use client";

import type { ReactElement } from "react";
import { CalendarClock, ClipboardList, ExternalLink, Lock, Megaphone, TrainFront, Trophy } from "lucide-react";
import type { HomeCardView, TripCardView } from "@/lib/main-wam/peserta/home";
import { noteHash } from "@/lib/main-wam/peserta/notifications";
import { mainWamPath, praWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { Banner, BracketCard, Button, EyebrowLabel, KeyValue, Pill, PulseDot } from "@/components/main-wam/ui";
import { Until } from "../Live";
import css from "./beranda.module.css";

const LOOK = {
  silent: { icon: <Lock /> },
  voting: { icon: <Trophy /> },
  berangkat: { icon: <TrainFront /> },
  survei: { icon: <ClipboardList /> },
} satisfies Record<string, { icon: ReactElement }>;

/**
 * The one contextual card under Sekarang (P01__status): a pinned announcement as a banner (to its
 * sheet in Notifikasi; a change such as "Kumpul jadi 05.30" as a warning with the schedule icon,
 * P02__status), or Silent Meeting / voting / the travel day / the survey as a bracket card (prototipe
 * .mc): a gold eyebrow with the live dot and the kind as a pill, the title in big capitals, one line,
 * and one gold button.
 */
export function HomeCard({ card, serverNow }: { card: HomeCardView; /** The server's clock: the travel card's countdown keeps counting from it. */ serverNow?: string }) {
  const t = useT();
  if (card.kind === "pengumuman") {
    const warning = card.tone === "warning";
    return <Banner tone={warning ? "warning" : "info"} icon={warning ? <CalendarClock /> : <Megaphone />} title={card.title} href={`${mainWamPath.notifications}#${noteHash(card.id)}`}>{card.body}</Banner>;
  }
  const look = LOOK[card.kind];
  const href = card.kind === "silent" ? mainWamPath.silentMeeting(card.target.silentSession)
    : card.kind === "voting" ? mainWamPath.awards
      : card.kind === "berangkat" ? mainWamPath.travel(card.target.direction)
        : praWamPath.questionnaire(card.target.survey ?? "");
  return <BracketCard as="article" motif="orbit" className={css.ctx}>
    <div className={css.ctxLead}>
      <EyebrowLabel tone="gold"><PulseDot />{card.kind === "berangkat" ? t("peserta.home.soonDepart") : t("peserta.home.openNow")}</EyebrowLabel>
      <Pill icon={look.icon}>{t(`peserta.home.tag.${card.kind}`)}</Pill>
    </div>
    <h2 className={css.ctxTitle}>{card.title}</h2>
    {card.trip && <TripBody trip={card.trip} serverNow={serverNow} />}
    {card.sub && <p className={css.ctxSub}>{card.sub}</p>}
    <div className={css.ctxAction}>
      {card.kind === "survei"
        ? <Button block href={href} aria-label={t("peserta.home.surveyActionLabel", { action: card.action })}><span className={css.labelIcon}>{card.action}<ExternalLink aria-hidden /></span></Button>
        : <Button block href={href}>{card.action}</Button>}
    </div>
  </BracketCard>;
}

/**
 * The train on the travel card (prototipe skenario kereta): the route as two dots on a dotted line
 * with both stations and times under it, the big countdown with what it counts to, and the small
 * tiles Peron, Gerbong, Kursi. Each part shows only when the data holds it; every line may wrap.
 */
function TripBody({ trip, serverNow }: { trip: TripCardView; serverNow?: string }) {
  const end = (place: string, time: string) => [place, time].filter(Boolean).join(" · ");
  return <>
    {(trip.from || trip.to) && <>
      <div className={css.route} aria-hidden><i className={css.dotOn} /><u /><span className={css.train}><TrainFront /></span><u /><i className={css.dot} /></div>
      <div className={css.routeLabels}><span>{end(trip.from, trip.depart)}</span>{trip.to && <span>{end(trip.to, trip.arrive)}</span>}</div>
    </>}
    {trip.count && <div className={css.count}>
      <span className={css.countFigure}>{trip.countAt && serverNow ? <Until at={trip.countAt} serverNow={serverNow} initial={trip.count} /> : trip.count}</span>
      {trip.countFor && <span className={css.countFor}>{trip.countFor}</span>}
    </div>}
    {trip.tiles.length > 0 && <div className={css.tiles}>{trip.tiles.map(tile => <KeyValue key={tile.label} label={tile.label} value={tile.value} />)}</div>}
  </>;
}
