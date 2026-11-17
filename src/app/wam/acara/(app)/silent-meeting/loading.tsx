import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** T01 while it loads: banner, question, privacy card, the field. */
export default function Loading() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat Silent Meeting">
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
