import { LayoutDashboard, ListChecks, SlidersHorizontal, Target, Trophy, UsersRound, type LucideIcon } from "lucide-react";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { mainWamAdminPath } from "@/lib/routes";

/*
 * Admin WAM 2026's sections (20 Nov 2026, docs/main-wam/KONTRAK.md §15): the admin of the WAM event
 * itself, its own door apart from Admin Pra WAM (/admin/wam). The menu, Ringkasan and the page titles
 * read this list. A tab-only page (`owner`) sits in the menu under its owner (Isi acara, Modul acara).
 * Its name is WAM_EVENT_ADMIN_LABEL, one constant.
 */
export type WamAcaraSectionKey = "ringkasan" | "pengaturan" | "panitia"
  | "isi" | "kamar" | "perjalanan" | "panduan" | "info"
  | "modul" | "silent" | "kuis" | "misi";
export type WamAcaraSection = {
  key: WamAcaraSectionKey;
  label: string;
  /** The menu group; groups show in the order they first appear. */
  group: string;
  href: string;
  icon: LucideIcon;
  /** One line on the Ringkasan card. */
  summary: string;
  /** A page shown as a tab of another section, not as its own menu item. */
  owner?: WamAcaraSectionKey;
};

export const wamAcaraSections: readonly WamAcaraSection[] = [
  { key: "ringkasan", label: "Ringkasan", group: "Ikhtisar", href: mainWamAdminPath.home, icon: LayoutDashboard, summary: "Mode acara, modul yang aktif, dan jalan ke setiap bagian." },
  { key: "pengaturan", label: "Pengaturan", group: "Persiapan", href: mainWamAdminPath.settings, icon: SlidersHorizontal, summary: "Mode acara, penguji, modul yang aktif, dan tema WAM 2026." },
  { key: "panitia", label: "Panitia WAM", group: "Persiapan", href: mainWamAdminPath.committee, icon: UsersRound, summary: "Siapa panitia acara WAM, dengan seksinya. Terpisah dari panitia Pra WAM." },
  { key: "isi", label: "Isi acara", group: "Untuk peserta", href: mainWamAdminPath.rundown, icon: ListChecks, summary: "Rundown, kamar, perjalanan, panduan, dan info acara." },
  { key: "kamar", label: "Kamar", group: "Untuk peserta", href: mainWamAdminPath.rooms, icon: ListChecks, summary: "Lantai dan catatan kamar dari pembagian kamar HR.", owner: "isi" },
  { key: "perjalanan", label: "Perjalanan", group: "Untuk peserta", href: mainWamAdminPath.travel, icon: ListChecks, summary: "Kumpul, kereta, shuttle, dan kursi tiap orang.", owner: "isi" },
  { key: "panduan", label: "Panduan", group: "Untuk peserta", href: mainWamAdminPath.guides, icon: ListChecks, summary: "Denah, hotel dan fasilitas, dress code, tata tertib.", owner: "isi" },
  { key: "info", label: "Info acara", group: "Untuk peserta", href: mainWamAdminPath.eventInfo, icon: ListChecks, summary: "Hotel, alamat, check-in/out, kontak panitia, tagihan hotel untuk Jejak karbon.", owner: "isi" },
  { key: "modul", label: "Modul acara", group: "Untuk peserta", href: mainWamAdminPath.awards, icon: Trophy, summary: "Kategori dan nominasi Awarding, pertanyaan Silent Meeting, Kuis live." },
  { key: "silent", label: "Silent Meeting", group: "Untuk peserta", href: mainWamAdminPath.silent, icon: Trophy, summary: "Pertanyaan Silent Meeting per sesi.", owner: "modul" },
  { key: "kuis", label: "Kuis live", group: "Untuk peserta", href: mainWamAdminPath.quizzes, icon: Trophy, summary: "Soal, pengendali, tautan layar besar, permainan, dan hasil kuis.", owner: "modul" },
  { key: "misi", label: "Misi", group: "Untuk peserta", href: mainWamAdminPath.missions, icon: Target, summary: "Misi foto, check-in lokasi, dan sesi; poin, bukti peserta, dan Peringkat." },
];

export const wamAcaraSection = (key: WamAcaraSectionKey): WamAcaraSection => wamAcaraSections.find(section => section.key === key)!;

/** The menu item that stands for a section: its owner for a tab-only page (kuis → Modul acara), else itself. */
export const wamAcaraMenuKey = (key: WamAcaraSectionKey): WamAcaraSectionKey => wamAcaraSection(key).owner ?? key;

/** The section a path belongs to; a deeper path (one quiz) belongs to its section. */
export function wamAcaraSectionAt(pathname: string): WamAcaraSection {
  const path = pathname.replace(/\/+$/, "");
  return [...wamAcaraSections].sort((a, b) => b.href.length - a.href.length).find(section => path === section.href || path.startsWith(`${section.href}/`)) ?? wamAcaraSections[0];
}

/** The sections grouped for the menu, in order; tab-only pages are left out. */
export function wamAcaraGroups(): { label: string; sections: WamAcaraSection[] }[] {
  const groups: { label: string; sections: WamAcaraSection[] }[] = [];
  for (const section of wamAcaraSections) {
    if (section.owner) continue;
    const group = groups.find(item => item.label === section.group);
    if (group) group.sections.push(section);
    else groups.push({ label: section.group, sections: [section] });
  }
  return groups;
}

/**
 * The breadcrumb of an Admin WAM 2026 page: "Admin WAM 2026 / Untuk peserta / Modul acara / Kuis live",
 * then `extra` steps (one quiz). Every step but the last links back (the group has no page of its own).
 */
export function wamAcaraCrumbs(key: WamAcaraSectionKey, ...extra: (string | { label: string; href?: string })[]): { label: string; href?: string }[] {
  const section = wamAcaraSection(key);
  const menu = wamAcaraSection(wamAcaraMenuKey(key));
  const steps: { label: string; href?: string }[] = [{ label: WAM_EVENT_ADMIN_LABEL, href: wamAcaraSections[0].href }, { label: menu.group }, { label: menu.label, href: menu.href }];
  if (section.owner) steps.push({ label: section.label, href: section.href });
  steps.push(...extra.map(step => typeof step === "string" ? { label: step } : step));
  return steps.map((step, index) => index === steps.length - 1 ? { label: step.label } : step);
}
