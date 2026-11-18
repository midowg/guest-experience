"use client";

import type { ReactElement } from "react";
import { CalendarClock, ClipboardList, ExternalLink, Lock, Megaphone, TrainFront, Trophy } from "lucide-react";
import type { HomeCardView } from "@/lib/main-wam/peserta/home";
import { noteHash } from "@/lib/main-wam/peserta/notifications";
import { mainWamPath, praWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { Banner, Button, Card, CardHead, type IconBoxTone } from "@/components/main-wam/ui";
import css from "../peserta.module.css";

const LOOK = {
  silent: { icon: <Lock />, tone: "primary" },
  voting: { icon: <Trophy />, tone: "awarding" },
  berangkat: { icon: <TrainFront />, tone: "primary" },
  survei: { icon: <ClipboardList />, tone: "primary" },
} satisfies Record<string, { icon: ReactElement; tone: IconBoxTone }>;

/**
 * The one contextual card under Sekarang (P01__status): a pinned announcement as a banner (to its
 * sheet in Notifikasi; a change such as "Kumpul jadi 05.30" as a warning with the schedule icon,
 * P02__status), or Silent Meeting / voting / the travel day / the survey with one tonal button.
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
  return <Card as="article">
    <CardHead icon={look.icon} iconTone={look.tone} title={card.title} sub={card.sub || undefined} />
    {card.kind === "survei"
      ? <Button variant="tonal" block href={href} aria-label={t("peserta.home.surveyActionLabel", { action: card.action })}><span className={css.labelIcon}>{card.action}<ExternalLink aria-hidden /></span></Button>
      : <Button variant="tonal" block href={href}>{card.action}</Button>}
  </Card>;
}
