import { ScreenContent } from "@/components/main-wam/shell";
import { Skeleton, SkeletonGroup } from "@/components/main-wam/ui";

/** Beranda while it loads, inside the frame (the bars stay). Owner A (peserta); C adds the BOD and panitia cards: shape it like the screen. */
export default function Loading() {
  return <ScreenContent>
    <SkeletonGroup label="Memuat beranda">
      <Skeleton shape="block" height={160} />
      <Skeleton width="60%" />
      <Skeleton width="80%" />
    </SkeletonGroup>
  </ScreenContent>;
}
