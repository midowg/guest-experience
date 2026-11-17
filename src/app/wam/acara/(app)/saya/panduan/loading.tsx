import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";

/** Panduan while it loads, inside the frame. Owner A (peserta). */
export default function Loading() {
  return <ListSkeleton label="Memuat panduan" groups={[4]} />;
}
