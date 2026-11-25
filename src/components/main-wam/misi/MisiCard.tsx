"use client";

import { ChevronRight, Medal, Trophy } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Card, Pill, ProgressBar, Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import type { MisiView } from "@/lib/main-wam/misi/missions";
import { mainWamPath } from "@/lib/routes";
import { useNum } from "./MisiParts";
import css from "./misi-card.module.css";

/**
 * Beranda's Misi card (module Misi, everyone but BOD): a summary of my Misi, never "the next mission".
 * My points big in gold (Barlow), my place ("Peringkat 7 dari 118"; hidden while the leaderboard is
 * closed or I am not ranked), how many missions are done of all (a thin bar), and one action, "Lihat
 * misi". The whole card opens the Misi page. No points yet: 0 and a short invitation; no mission yet:
 * a quiet line. Words say the state (not the colour of the bar).
 */
export function MisiCard({ view }: { view: MisiView }) {
  const t = useT();
  const num = useNum();
  if (!view.migrated) return null;
  const { summary } = view;
  const place = view.leaderboardOpen ? view.place : null;
  const hint = !summary.total ? t("misi.card.noneSub") : view.points <= 0 ? t("misi.card.start") : null;
  return <Card as="article" motif="matriks" className={css.tile} href={mainWamPath.missions}>
    <span className={css.top}>
      <Pill icon={<Trophy />}>{t("misi.card.title")}</Pill>
      <span className={css.action}>{t("misi.card.action")}<ChevronRight aria-hidden /></span>
    </span>
    <span className={css.main}>
      <span className={css.points}><b>{num(view.points)}</b><span>{t("misi.card.points")}</span></span>
      {place && <span className={css.place}><Medal aria-hidden />{t("misi.card.rank", { rank: num(place.rank), total: num(place.of) })}</span>}
    </span>
    {hint && <span className={css.hint}>{hint}</span>}
    {summary.total > 0 && <ProgressBar thin value={summary.done} max={summary.total} label={t("misi.card.progressLabel")}
      valueText={t("misi.card.done", { done: num(summary.done), total: num(summary.total) })} />}
  </Card>;
}

/** The card while its numbers are read (as tall as the card, so nothing jumps). */
export function MisiCardSkeleton() {
  const t = useT();
  return <SkeletonGroup label={t("misi.loading")}>
    <Card className={css.tile}>
      <Skeleton width={72} /><Skeleton shape="title" width={120} /><Skeleton shape="block" height={4} />
    </Card>
  </SkeletonGroup>;
}
