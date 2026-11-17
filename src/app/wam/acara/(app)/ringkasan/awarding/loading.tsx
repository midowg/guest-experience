import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** B06 while it loads: the banner and the category cards. */
export default function Loading() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat persetujuan">
      <Stack>
        <Skeleton shape="block" height={56} />
        <Skeleton shape="card" height={320} />
        <Skeleton shape="card" height={240} />
      </Stack>
    </SkeletonGroup>
  </ScreenContent>;
}
