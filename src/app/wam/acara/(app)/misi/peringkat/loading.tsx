"use client";

import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** Peringkat while it loads: the summary and a column of rows. */
export default function Loading() {
  const t = useT();
  return <ScreenContent>
    <SkeletonGroup label={t("misi.loading")}>
      <Stack>
        <Skeleton shape="block" height={48} />
        <Skeleton shape="card" height={56} />
        <Skeleton shape="card" height={56} />
        <Skeleton shape="card" height={56} />
        <Skeleton shape="card" height={56} />
        <Skeleton shape="card" height={56} />
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
