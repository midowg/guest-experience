import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";

/** Bantuan while it loads, inside the frame. Owner A (peserta). */
export default function Loading() {
  return <ListSkeleton label="Memuat bantuan" groups={[3, 1]} />;
}
