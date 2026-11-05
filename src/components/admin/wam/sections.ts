import { CalendarRange, ClipboardList, Info, KeyRound, LayoutDashboard, Map as MapIcon, UsersRound, type LucideIcon } from "lucide-react";
import { wamAdminPath } from "@/lib/routes";

/*
 * Admin WAM's sections, in menu order. The menu, the Ringkasan cards and the page titles all read
 * this list, so a new section (the "Data personal" pages HR will fill for WAM and Pra WAM, say) is
 * one entry here, its path in wamAdminPath and its page under src/app/admin/wam/. A new group
 * name starts a new group in the menu.
 */
export type WamSectionKey = "ringkasan" | "akun" | "reset" | "acara" | "about" | "ruang" | "kuesioner";
export type WamSection = {
  key: WamSectionKey;
  label: string;
  /** The menu group; groups show in the order they first appear. */
  group: string;
  href: string;
  icon: LucideIcon;
  /** One line on the Ringkasan card. */
  summary: string;
};

export const wamSections: readonly WamSection[] = [
  { key: "ringkasan", label: "Ringkasan", group: "Ikhtisar", href: wamAdminPath.home, icon: LayoutDashboard, summary: "Angka penting dan jalan ke setiap bagian." },
  { key: "akun", label: "Akun dan peran", group: "Orang", href: wamAdminPath.accounts, icon: UsersRound, summary: "Buat akun, atur peran, ubah email login, dan reset password." },
  { key: "reset", label: "Permintaan reset password", group: "Orang", href: wamAdminPath.resetRequests, icon: KeyRound, summary: "Jawab permintaan dari halaman Lupa password." },
  { key: "acara", label: "Acara dan modul", group: "Aplikasi", href: wamAdminPath.events, icon: CalendarRange, summary: "Status Pra WAM dan WAM, serta modul yang dibuka." },
  { key: "about", label: "Apa itu WAM", group: "Aplikasi", href: wamAdminPath.about, icon: Info, summary: "Teks penjelasan WAM di Beranda peserta." },
  { key: "ruang", label: "Ruang dan denah", group: "Aplikasi", href: wamAdminPath.rooms, icon: MapIcon, summary: "Kapasitas ruang, spot di denah, dan tampil tidaknya denah di Book." },
  { key: "kuesioner", label: "Kuesioner", group: "Data peserta", href: wamAdminPath.questionnaire.content, icon: ClipboardList, summary: "Isi, pengaturan, progres, rekap, dan ekspor kuesioner personal." },
];

export const wamSection = (key: WamSectionKey): WamSection => wamSections.find(section => section.key === key)!;

/** The section a path belongs to; a deeper path (a future detail page) belongs to its section. */
export function wamSectionAt(pathname: string): WamSection {
  const path = pathname.replace(/\/+$/, "");
  return [...wamSections].sort((a, b) => b.href.length - a.href.length).find(section => path === section.href || path.startsWith(`${section.href}/`)) ?? wamSections[0];
}

/** The sections grouped for the menu, in order. */
export function wamGroups(): { label: string; sections: WamSection[] }[] {
  const groups: { label: string; sections: WamSection[] }[] = [];
  for (const section of wamSections) {
    const group = groups.find(item => item.label === section.group);
    if (group) group.sections.push(section);
    else groups.push({ label: section.group, sections: [section] });
  }
  return groups;
}
