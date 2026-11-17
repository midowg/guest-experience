import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";

/** Saya while it loads, inside the frame. Owner A (peserta). */
export default function Loading() {
  return <ListSkeleton label="Memuat saya" groups={[2, 2, 3]} />;
}
