import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** B05 while it loads: count, question, topics, feedback cards. */
export default function Loading() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat rekap">
      <Stack>
        <Skeleton width="40%" />
        <Skeleton shape="title" width="50%" />
        <Skeleton shape="card" height={88} />
        <Skeleton shape="card" height={200} />
        <Skeleton shape="card" height={112} />
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
