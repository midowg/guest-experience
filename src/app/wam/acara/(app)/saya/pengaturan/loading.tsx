import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";

/** Pengaturan while it loads, inside the frame. Owner A (peserta). */
export default function Loading() {
  return <ListSkeleton label="Memuat pengaturan" groups={[2]} />;
}
