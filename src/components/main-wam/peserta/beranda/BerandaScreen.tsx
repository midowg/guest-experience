"use client";

import type { ReactNode } from "react";
import { Hourglass } from "lucide-react";
import type { HomeData } from "@/lib/main-wam/peserta/home";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { Card, CardHead } from "@/components/main-wam/ui";
import { OfflineBanner, RefreshAt, RetryBanner } from "../Live";
import { BerandaCarousel } from "./BerandaCarousel";
import { HomeCard } from "./HomeCard";
import { NowSlides } from "./NowSlides";
import { PegasusMark } from "../PegasusMark";

/**
 * Beranda (P01/P02; prototipe SC.beranda), the head being the shell's: the main card as a slide of at most three (Selesai, Sekarang, Akan datang; the Sekarang one is the gold
 * bracket card), one contextual card, then ONE carousel of the secondary cards: Kuis live (first, while a game is on),
 * Misi, Jejak karbon (green, while its module is on), Momen and Mozaik (module Mozaik). Other areas come in as slots, already
 * rendered by the page. The pegasus watermark sits behind.
 */
export function BerandaScreen({ data, serverNow, since, slots, live = true, forceOffline }: {
  data: HomeData;
  /** The server's clock when it was read (the countdown keeps counting from it). */
  serverNow: string;
  /** "07.38": when the data was read, for the offline banner. */
  since: string;
  slots: { absen?: ReactNode; momen?: ReactNode; carbon?: ReactNode; kuis?: ReactNode; misi?: ReactNode; mozaik?: ReactNode };
  /** Refresh by itself when a card changes (off in previews, where time stands still). */
  live?: boolean;
  forceOffline?: boolean;
}) {
  const t = useT();
  const cards = ([["kuis", slots.kuis], ["misi", slots.misi], ["karbon", slots.carbon], ["momen", slots.momen], ["mozaik", slots.mozaik]] as const)
    .filter(([, node]) => node !== null && node !== undefined && node !== false)
    .map(([key, node]) => ({ key, node }));
  return <ScreenContent>
    <PegasusMark />
    <OfflineBanner since={since} force={forceOffline} />
    {data.failed && <RetryBanner>{t("peserta.live.agendaFailed")}</RetryBanner>}
    {!data.migrated
      ? <Card as="article"><CardHead icon={<Hourglass />} title={t("peserta.waiting.title")} sub={t("peserta.waiting.home")} /></Card>
      : !data.failed && <NowSlides data={data} absen={slots.absen} serverNow={serverNow} />}
    {data.card && <HomeCard card={data.card} serverNow={serverNow} />}
    {/* The secondary cards in ONE carousel: Kuis live (while a game is open) first, then Misi, Jejak karbon, Momen, Mozaik; a card with its module off is left out. */}
    {cards.length > 0 && <BerandaCarousel cards={cards} />}
    {live && <RefreshAt at={data.refreshAt} serverNow={serverNow} />}
  </ScreenContent>;
}
