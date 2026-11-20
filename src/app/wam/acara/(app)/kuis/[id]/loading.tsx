"use client";

import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** Kuis live while it loads: the level and timer row, the value, the question, four options. */
export default function Loading() {
  const t = useT();
  return <ScreenContent>
    <SkeletonGroup label={t("ui.loading")}>
      <Stack>
        <Skeleton shape="block" height={40} />
        <Skeleton shape="block" height={150} />
        <Skeleton width="80%" />
        {[0, 1, 2, 3].map(i => <Skeleton key={i} shape="block" height={64} />)}
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
