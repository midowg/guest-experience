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
 * BOD's Ringkasan under it (agen C; panitia's tools are the Panitia tab, not a card here), one contextual card, the
 * Momen card (agen B), and after it the small Jejak karbon card while its module is on (everyone, a slot too). Kuis live's
 * cards ("Kuis dimulai · Ikut", "Kendalikan kuis") come first while a game is on (a slot of the module kuis). Other
 * areas come in as slots, already rendered by the page.
 */
export function BerandaScreen({ data, serverNow, since, slots, live = true, forceOffline }: {
  data: HomeData;
  /** The server's clock when it was read (the countdown keeps counting from it). */
  serverNow: string;
  /** "07.38": when the data was read, for the offline banner. */
  since: string;
  slots: { absen?: ReactNode; bod?: ReactNode; momen?: ReactNode; carbon?: ReactNode; kuis?: ReactNode; misi?: ReactNode };
  /** Refresh by itself when a card changes (off in previews, where time stands still). */
  live?: boolean;
  forceOffline?: boolean;
}) {
  const t = useT();
  return <ScreenContent>
    <OfflineBanner since={since} force={forceOffline} />
    {data.failed && <RetryBanner>{t("peserta.live.agendaFailed")}</RetryBanner>}
    {/* Kuis live (module kuis): "Kuis dimulai · Ikut" first while a game is open, it is for now. */}
    {slots.kuis}
    {!data.migrated
      ? <Card as="article"><CardHead icon={<Hourglass />} title={t("peserta.waiting.title")} sub={t("peserta.waiting.home")} /></Card>
      : !data.failed && <NowCard view={data.now} absen={slots.absen} serverNow={serverNow} ceklis={data.ceklis} />}
    {slots.bod}
    {data.card && <HomeCard card={data.card} />}
    {slots.momen}
    {slots.misi}
    {slots.carbon}
    {live && <RefreshAt at={data.refreshAt} serverNow={serverNow} />}
  </ScreenContent>;
}
