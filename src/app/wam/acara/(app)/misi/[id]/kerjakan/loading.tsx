"use client";

import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** Kerjakan misi while it loads: the title, the location line and the viewfinder. */
export default function Loading() {
  const t = useT();
  return <ScreenContent>
    <SkeletonGroup label={t("misi.loading")}>
      <Stack>
        <Skeleton shape="block" height={44} />
        <Skeleton shape="block" height={56} />
        <Skeleton shape="card" height={320} />
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
