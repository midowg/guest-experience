import { SegmentedControl } from "@/components/console";
import { hrPath } from "@/lib/routes";

/** Kelola's parts, as links: the day's absensi (with the faces), office points, who is Admin HR. */
export function ManageTabs({ current }: { current: "absen" | "kantor" | "akses" }) {
  return <SegmentedControl label="Bagian Kelola" value={current} options={[
    { value: "absen", label: "Absen harian", href: hrPath.manage() },
    { value: "kantor", label: "Titik kantor", href: hrPath.manageOffices },
    { value: "akses", label: "Akses", href: hrPath.manageAccess },
  ]} />;
}
