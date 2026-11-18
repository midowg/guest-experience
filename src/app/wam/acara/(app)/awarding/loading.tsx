"use client";

import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** V01 while it loads: the banner and three category cards. */
export default function Loading() {
  const t = useT();
  return <ScreenContent>
    <SkeletonGroup label={t("awards.loading")}>
      <Stack>
        <Skeleton shape="block" height={48} />
        <Skeleton shape="card" height={128} />
        <Skeleton shape="card" height={128} />
        <Skeleton shape="card" height={88} />
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
