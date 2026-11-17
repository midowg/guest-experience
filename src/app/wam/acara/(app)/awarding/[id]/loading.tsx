import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** V02 while it loads: the question and the radio cards. */
export default function Loading() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat nominasi">
      <Stack>
        <Skeleton shape="title" width="70%" />
        <Skeleton width="90%" />
        {[0, 1, 2, 3].map(index => <Skeleton key={index} shape="card" height={96} />)}
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
