"use client";

import type { ReactNode } from "react";
import { Hourglass } from "lucide-react";
import type { HomeData } from "@/lib/main-wam/peserta/home";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { Card, CardHead } from "@/components/main-wam/ui";
import { OfflineBanner, RefreshAt, RetryBanner } from "../Live";
import { HomeCard } from "./HomeCard";
import { NowCard } from "./NowCard";

/**
 * Beranda (P01/P02, revisi 16 Nov): at most four blocks, the head being the shell's: Sekarang, the
 * role's card under it (BOD's Ringkasan, panitia's Kelola: agen C), one contextual card, and the
 * Momen card (agen B). Other areas come in as slots, already rendered by the page.
 */
export function BerandaScreen({ data, serverNow, since, slots, live = true, forceOffline }: {
  data: HomeData;
  /** The server's clock when it was read (the countdown keeps counting from it). */
  serverNow: string;
  /** "07.38": when the data was read, for the offline banner. */
  since: string;
  slots: { absen?: ReactNode; panitia?: ReactNode; bod?: ReactNode; momen?: ReactNode };
  /** Refresh by itself when a card changes (off in previews, where time stands still). */
  live?: boolean;
  forceOffline?: boolean;
}) {
  const t = useT();
  return <ScreenContent>
    <OfflineBanner since={since} force={forceOffline} />
    {data.failed && <RetryBanner>{t("peserta.live.agendaFailed")}</RetryBanner>}
    {!data.migrated
      ? <Card as="article"><CardHead icon={<Hourglass />} title={t("peserta.waiting.title")} sub={t("peserta.waiting.home")} /></Card>
      : !data.failed && <NowCard view={data.now} absen={slots.absen} serverNow={serverNow} />}
    {slots.panitia}
    {slots.bod}
    {data.card && <HomeCard card={data.card} />}
    {slots.momen}
    {live && <RefreshAt at={data.refreshAt} serverNow={serverNow} />}
  </ScreenContent>;
}
