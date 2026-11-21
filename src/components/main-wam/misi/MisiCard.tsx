"use client";

import { ChevronRight, Target } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Card, IconBox, Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import { nextMission, type MisiView } from "@/lib/main-wam/misi/missions";
import { mainWamPath } from "@/lib/routes";
import { ReqChips } from "./MisiParts";
import css from "./misi.module.css";

/** At most this many little bars show the missions done (a long list is told by the words). */
const MAX_SEGMENTS = 8;

/**
 * Beranda's Misi card (module Misi, everyone but BOD): my points and how many missions are done on
 * the left; on the right the next mission I can start now, with what it asks. The whole card opens the
 * Misi page. No mission yet: a quiet line. Words say the state (not the colour of the bars).
 */
export function MisiCard({ view }: { view: MisiView }) {
  const t = useT();
  if (!view.migrated) return null;
  const { summary } = view;
  const next = nextMission(view.items);
  const segments = Math.min(summary.total, MAX_SEGMENTS);
  const lit = summary.total ? Math.round((summary.done / summary.total) * segments) : 0;
  let title: string, sub: string | null = null;
  if (!summary.total) { title = t("misi.card.none"); sub = t("misi.card.noneSub"); }
  else if (next) title = next.title;
  else if (summary.pending) { title = t("misi.card.waiting"); sub = t("misi.card.waitingSub"); }
  else if (summary.done === summary.total) { title = t("misi.card.allDone"); sub = t("misi.card.allDoneSub"); }
  else { title = t("misi.card.closedAll"); sub = t("misi.card.closedAllSub"); }
  return <Card as="article" className={css.tile} href={mainWamPath.missions}>
    <span className={css.tileLeft}>
      <span className={css.tileTag}><IconBox icon={<Target />} tone="awarding" smallIcon className={css.tileIcon} />{t("misi.card.title")}</span>
      <span className={css.tilePoints}><b>{view.points}</b><span>{t("misi.card.points")}</span></span>
      {segments > 0 && <span className={css.segments} role="img" aria-label={t("misi.card.progress", { done: summary.done, total: summary.total })}>
        {Array.from({ length: segments }, (_, index) => <i key={index} className={index < lit ? css.segOn : undefined} />)}
      </span>}
    </span>
    <span className={css.tileRight}>
      {next && <span className={css.tileKicker}>{t("misi.card.next", { points: next.points })}</span>}
      <span className={css.tileTitle}>{title}</span>
      {next ? <ReqChips item={next} /> : sub && <span className={css.tileSub}>{sub}</span>}
    </span>
    <ChevronRight aria-hidden className={css.tileChevron} />
  </Card>;
}

/** The card while its numbers are read (as tall as the card, so nothing jumps). */
export function MisiCardSkeleton() {
  const t = useT();
  return <SkeletonGroup label={t("misi.loading")}>
    <Card className={css.tile}>
      <span className={css.tileLeft}><Skeleton width={72} /><Skeleton shape="title" width={88} /><Skeleton shape="block" height={4} /></span>
      <span className={css.tileRight}><Skeleton width="60%" /><Skeleton width="90%" /><Skeleton width="50%" /></span>
    </Card>
  </SkeletonGroup>;
}
