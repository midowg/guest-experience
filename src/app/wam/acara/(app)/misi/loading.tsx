"use client";

import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** Misi while it loads: the hero, the chips and a few rows. */
export default function Loading() {
  const t = useT();
  return <ScreenContent>
    <SkeletonGroup label={t("misi.loading")}>
      <Stack>
        <Skeleton shape="card" height={128} />
        <Skeleton shape="block" height={36} />
        <Skeleton shape="card" height={72} />
        <Skeleton shape="card" height={72} />
        <Skeleton shape="card" height={72} />
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
