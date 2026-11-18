"use client";

import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";
import css from "@/components/main-wam/modul/modul.module.css";

/** A02–A04 while it loads: the result's shape. */
export default function Loading() {
  const t = useT();
  return <ScreenContent>
    <SkeletonGroup label={t("absen.recording")} className={css.result}>
      <Skeleton shape="circle" width={96} height={96} />
      <Skeleton shape="title" width="60%" />
      <Skeleton width="70%" />
    </SkeletonGroup>
  </ScreenContent>;
}
