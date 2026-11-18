"use client";

import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** T01 while it loads: banner, question, privacy card, the field. */
export default function Loading() {
  const t = useT();
  return <ScreenContent>
    <SkeletonGroup label={t("silent.loading")}>
      <Stack>
        <Skeleton shape="block" height={48} />
        <Skeleton shape="card" height={88} />
        <Skeleton shape="card" height={96} />
        <Skeleton width="30%" />
        <Skeleton shape="block" height={160} />
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
