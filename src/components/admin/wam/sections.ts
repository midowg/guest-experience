import { Archive, CalendarRange, ClipboardList, Info, KeyRound, LayoutDashboard, Map as MapIcon, Palette, Plug, Send, Tv, UsersRound, type LucideIcon } from "lucide-react";
import { MCP_ADMIN_PATH } from "@/lib/pra-wam/mcp";
import { wamAdminPath } from "@/lib/routes";

/*
 * Admin WAM's sections, in menu order. The menu, the Ringkasan cards and the page titles all read
 * this list, so a new section (the "Data personal" pages HR will fill for WAM and Pra WAM, say) is
 * one entry here, its path in wamAdminPath and its page under src/app/admin/wam/. A new group
 * name starts a new group in the menu.
 */
export type WamSectionKey = "ringkasan" | "akun" | "reset" | "mcp" | "acara" | "about" | "tema" | "ruang" | "tv" | "telegram" | "arsip" | "kuesioner";
export type WamSection = {
  key: WamSectionKey;
  label: string;
  /** The menu group; groups show in the order they first appear. */
  group: string;
  href: string;
  icon: LucideIcon;
  /** One line on the Ringkasan card. */
  summary: string;
  /**
   * A page shown as a tab of another section, not as its own menu item: the menu marks `owner`
   * (and shows this section's badge there) while it is open.
   */
  owner?: WamSectionKey;
};

/*
 * 13 Nov 2026, regrouped by what the admin does there: people; the event and its meetings (rooms,
 * MoM and where it goes); what participants see (questionnaire, Beranda's text, the office TV);
 * and the settings rarely touched (theme, MCP access) at the bottom.
 */
export const wamSections: readonly WamSection[] = [
  { key: "ringkasan", label: "Ringkasan", group: "Ikhtisar", href: wamAdminPath.home, icon: LayoutDashboard, summary: "Angka penting dan jalan ke setiap bagian." },
  { key: "akun", label: "Akun dan peran", group: "Orang", href: wamAdminPath.accounts, icon: UsersRound, summary: "Buat akun, atur peran, ubah email login, dan reset password." },
  { key: "reset", label: "Permintaan reset password", group: "Orang", href: wamAdminPath.resetRequests, icon: KeyRound, summary: "Jawab permintaan dari halaman Lupa password.", owner: "akun" },
  { key: "acara", label: "Acara dan modul", group: "Acara dan meeting", href: wamAdminPath.events, icon: CalendarRange, summary: "Status Pra WAM dan WAM, modul yang dibuka, dan meeting yang wajib MoM." },
  { key: "ruang", label: "Ruang dan denah", group: "Acara dan meeting", href: wamAdminPath.rooms, icon: MapIcon, summary: "Kapasitas ruang, spot di denah, dan tampil tidaknya denah di Book." },
  { key: "arsip", label: "Arsip MoM", group: "Acara dan meeting", href: wamAdminPath.momCabinet, icon: Archive, summary: "Semua MoM terkirim dengan PDF dan fotonya, per bulan, kegiatan, tanggal, dan tim; ekspor Excel, Word, dan ZIP." },
  { key: "telegram", label: "Telegram", group: "Acara dan meeting", href: wamAdminPath.telegram, icon: Send, summary: "Bot MoM, grup Telegram tiap departemen, dan chat CoS untuk BOD." },
  { key: "kuesioner", label: "Kuesioner", group: "Untuk peserta", href: wamAdminPath.questionnaire.content, icon: ClipboardList, summary: "Isi, pengaturan, progres, rekap, dan ekspor kuesioner personal." },
  { key: "about", label: "Apa itu WAM", group: "Untuk peserta", href: wamAdminPath.about, icon: Info, summary: "Teks penjelasan WAM di Beranda peserta." },
  { key: "tv", label: "TV Announcement", group: "Untuk peserta", href: wamAdminPath.tv, icon: Tv, summary: "TV kantor: jadwal ruang hari ini dan gambar pengumuman, berganti otomatis." },
  { key: "tema", label: "Tema aplikasi", group: "Pengaturan", href: wamAdminPath.theme, icon: Palette, summary: "Tema WAM untuk semua orang: Dream Out Loud atau Werkudara." },
  { key: "mcp", label: "Akses MCP", group: "Pengaturan", href: MCP_ADMIN_PATH, icon: Plug, summary: "Siapa boleh menghubungkan Claude atau ChatGPT ke data WAM, dan panggilan terakhir." },
];

export const wamSection = (key: WamSectionKey): WamSection => wamSections.find(section => section.key === key)!;

/** The section a path belongs to; a deeper path (a future detail page) belongs to its section. */
export function wamSectionAt(pathname: string): WamSection {
  const path = pathname.replace(/\/+$/, "");
  return [...wamSections].sort((a, b) => b.href.length - a.href.length).find(section => path === section.href || path.startsWith(`${section.href}/`)) ?? wamSections[0];
}

/** The menu item that stands for a section: its owner for a tab-only page (reset → akun), else itself. */
export const wamMenuKey = (key: WamSectionKey): WamSectionKey => wamSection(key).owner ?? key;

/** The sections grouped for the menu, in order; tab-only pages (with an owner) are left out. */
export function wamGroups(): { label: string; sections: WamSection[] }[] {
  const groups: { label: string; sections: WamSection[] }[] = [];
  for (const section of wamSections) {
    if (section.owner) continue;
    const group = groups.find(item => item.label === section.group);
    if (group) group.sections.push(section);
    else groups.push({ label: section.group, sections: [section] });
  }
  return groups;
}

export const WAM_ADMIN_LABEL = "Admin WAM";

/**
 * The breadcrumb of an Admin WAM page: "Admin WAM / Orang / Akun dan peran", then `extra` steps
 * (a tab, a person). A tab-only page sits under its owner: "… / Akun dan peran / Permintaan reset password".
 * Every step but the last links back (the group has no page of its own).
 */
export function wamCrumbs(key: WamSectionKey, ...extra: (string | { label: string; href?: string })[]): { label: string; href?: string }[] {
  const section = wamSection(key);
  const menu = wamSection(wamMenuKey(key));
  const steps: { label: string; href?: string }[] = [{ label: WAM_ADMIN_LABEL, href: wamSections[0].href }, { label: menu.group }, { label: menu.label, href: menu.href }];
  if (section.owner) steps.push({ label: section.label, href: section.href });
  steps.push(...extra.map(step => typeof step === "string" ? { label: step } : step));
  return steps.map((step, index) => index === steps.length - 1 ? { label: step.label } : step);
}
