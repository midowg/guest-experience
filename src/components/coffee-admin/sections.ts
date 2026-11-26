import { ChartColumn, Inbox, Settings, type LucideIcon } from "lucide-react";
import { coffeeAdminPath } from "@/lib/routes";

/*
 * WG Coffee's admin (25 Nov 2026): the pengelola's pages in Journey Admin (/admin/coffee),
 * given per person in Super admin → Akses admin ("WG Coffee"). The menu, the phone's tab bar
 * and the page titles read this list.
 */
export type CoffeeAdminSectionKey = "antrean" | "rekap" | "pengaturan";
export type CoffeeAdminSection = {
  key: CoffeeAdminSectionKey;
  label: string;
  /** The menu group; groups show in the order they first appear. */
  group: string;
  href: string;
  icon: LucideIcon;
  /** The line under the page's title. */
  summary: string;
};

export const COFFEE_ADMIN_LABEL = "WG Coffee";
/** The migration the menu and the option switches wait for (said where they cannot be changed yet). */
export const COFFEE_MENU_MIGRATION_NAME = "202612020001_coffee_menu.sql";

export const coffeeAdminSections: readonly CoffeeAdminSection[] = [
  { key: "antrean", label: "Antrean", group: "Pesanan", href: coffeeAdminPath.home, icon: Inbox, summary: "Pesanan menunggu, terlama di atas. Beli di aplikasi JumpStart, lalu tandai selesai. Terlihat oleh semua pemegang akses." },
  { key: "rekap", label: "Rekap", group: "Pesanan", href: coffeeAdminPath.recap(), icon: ChartColumn, summary: "Satu baris per minuman. Filter, lalu unduh untuk diolah sendiri." },
  { key: "pengaturan", label: "Pengaturan", group: "Pengaturan", href: coffeeAdminPath.settings, icon: Settings, summary: "Jatah per bulan, opsi minuman, PIN GA, pemegang akses, dan ruangan." },
];

export const coffeeAdminSection = (key: CoffeeAdminSectionKey): CoffeeAdminSection => coffeeAdminSections.find(section => section.key === key)!;

/** The section an address belongs to ("/admin/coffee/rekap" → rekap); null outside the admin. */
export function sectionOfPath(path: string | null | undefined): CoffeeAdminSectionKey | null {
  const clean = (path ?? "").split(/[?#]/)[0].replace(/\/+$/, "");
  return coffeeAdminSections.find(section => section.href === clean)?.key ?? null;
}

/** The sections grouped for the menu, in order. */
export function coffeeAdminGroups(): { label: string; sections: CoffeeAdminSection[] }[] {
  const groups: { label: string; sections: CoffeeAdminSection[] }[] = [];
  for (const section of coffeeAdminSections) {
    const group = groups.find(item => item.label === section.group);
    if (group) group.sections.push(section);
    else groups.push({ label: section.group, sections: [section] });
  }
  return groups;
}
