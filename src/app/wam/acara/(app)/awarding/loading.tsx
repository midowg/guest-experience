import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** V01 while it loads: the banner and three category cards. */
export default function Loading() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat awarding">
      <Stack>
        <Skeleton shape="block" height={48} />
        <Skeleton shape="card" height={128} />
        <Skeleton shape="card" height={128} />
        <Skeleton shape="card" height={88} />
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
