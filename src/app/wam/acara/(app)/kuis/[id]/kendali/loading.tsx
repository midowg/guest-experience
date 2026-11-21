"use client";

import { useT } from "@/components/main-wam/i18n";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** The MC's control while it loads: the status, Lanjut and Jeda, the question. */
export default function Loading() {
  const t = useT();
  return <ScreenContent>
    <SkeletonGroup label={t("ui.loading")}>
      <Stack>
        <Skeleton shape="card" height={88} />
        <Skeleton shape="block" height={64} />
        <Skeleton shape="block" height={44} />
        <Skeleton shape="card" height={200} />
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
