import { CalendarDays, FilePen, Inbox, LayoutDashboard, MapPin, ScanFace, type LucideIcon } from "lucide-react";
import { hrAdminPath } from "@/lib/routes";

/*
 * Admin WG People's sections (20 Nov 2026): the admin of the HR app (/hr) in Journey Admin, given
 * per person in Super admin → Akses admin ("WG People"). The menu, Ringkasan and the page titles
 * read this list. Cuti and lembur join as new sections later.
 */
export type HrAdminSectionKey = "ringkasan" | "perlu" | "revisi" | "absen" | "wajah" | "kantor";
export type HrAdminSection = {
  key: HrAdminSectionKey;
  label: string;
  /** The menu group; groups show in the order they first appear. */
  group: string;
  href: string;
  icon: LucideIcon;
  /** One line on the Ringkasan card. */
  summary: string;
};

export const HR_ADMIN_LABEL = "Admin HR";

export const hrAdminSections: readonly HrAdminSection[] = [
  { key: "ringkasan", label: "Ringkasan", group: "Ikhtisar", href: hrAdminPath.home, icon: LayoutDashboard, summary: "Angka hari ini dan yang masih perlu disiapkan." },
  { key: "perlu", label: "Perlu dicek", group: "Absensi", href: hrAdminPath.waiting, icon: Inbox, summary: "Absen yang menunggu keputusan: setujui atau tolak." },
  { key: "revisi", label: "Revisi", group: "Absensi", href: hrAdminPath.requests, icon: FilePen, summary: "Perbaikan absen yang diajukan karyawan: setujui (langsung diterapkan) atau tolak." },
  { key: "absen", label: "Absen harian", group: "Absensi", href: hrAdminPath.day(), icon: CalendarDays, summary: "Masuk dan pulang semua orang per hari; catat manual." },
  { key: "wajah", label: "Wajah terdaftar", group: "Pengaturan", href: hrAdminPath.faces, icon: ScanFace, summary: "Wajah acuan, persetujuan, dan Proses foto impor." },
  { key: "kantor", label: "Titik kantor", group: "Pengaturan", href: hrAdminPath.offices, icon: MapPin, summary: "Lokasi kantor dan radiusnya untuk absen." },
];

export const hrAdminSection = (key: HrAdminSectionKey): HrAdminSection => hrAdminSections.find(section => section.key === key)!;

/** The sections grouped for the menu, in order. */
export function hrAdminGroups(): { label: string; sections: HrAdminSection[] }[] {
  const groups: { label: string; sections: HrAdminSection[] }[] = [];
  for (const section of hrAdminSections) {
    const group = groups.find(item => item.label === section.group);
    if (group) group.sections.push(section);
    else groups.push({ label: section.group, sections: [section] });
  }
  return groups;
}
