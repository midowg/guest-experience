"use client";

import type { ReactElement } from "react";
import { CalendarClock, ClipboardList, ExternalLink, Lock, Megaphone, TrainFront, Trophy } from "lucide-react";
import type { HomeCardView } from "@/lib/main-wam/peserta/home";
import { noteHash } from "@/lib/main-wam/peserta/notifications";
import { mainWamPath, praWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { Banner, BracketCard, Button, EyebrowLabel, Pill, PulseDot } from "@/components/main-wam/ui";
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
export function HomeCard({ card }: { card: HomeCardView }) {
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
    {card.sub && <p className={css.ctxSub}>{card.sub}</p>}
    <div className={css.ctxAction}>
      {card.kind === "survei"
        ? <Button block href={href} aria-label={t("peserta.home.surveyActionLabel", { action: card.action })}><span className={css.labelIcon}>{card.action}<ExternalLink aria-hidden /></span></Button>
        : <Button block href={href}>{card.action}</Button>}
    </div>
  </BracketCard>;
}
