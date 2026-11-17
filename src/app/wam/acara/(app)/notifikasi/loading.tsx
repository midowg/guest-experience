import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";

/** Notifikasi while it loads, inside the frame. Owner A (peserta). */
export default function Loading() {
  return <ListSkeleton label="Memuat notifikasi" groups={[4, 2]} />;
}
