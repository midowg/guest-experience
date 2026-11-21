import { Archive, CalendarRange, ClipboardList, Info, KeyRound, LayoutDashboard, ListChecks, Map as MapIcon, Palette, Plug, Send, SlidersHorizontal, Target, Trophy, Tv, UsersRound, type LucideIcon } from "lucide-react";
import { MCP_ADMIN_PATH } from "@/lib/pra-wam/mcp";
import { mainWamAdminPath, wamAdminPath } from "@/lib/routes";

/*
 * Admin WAM's sections, in menu order. The menu, the Ringkasan cards and the page titles all read
 * this list, so a new section (the "Data personal" pages HR will fill for WAM and Pra WAM, say) is
 * one entry here, its path in wamAdminPath and its page under src/app/admin/wam/. A new group
 * name starts a new group in the menu.
 */
export type WamSectionKey = "ringkasan" | "akun" | "reset" | "mcp" | "acara" | "about" | "tema" | "ruang" | "tv" | "telegram" | "arsip" | "kuesioner"
  // Main WAM (17 Nov 2026, docs/main-wam/KONTRAK.md): Pengaturan (fondasi), Isi acara and its tabs (agen E), Modul acara and its tab (agen D).
  | "mw-pengaturan" | "mw-isi" | "mw-kamar" | "mw-perjalanan" | "mw-panduan" | "mw-info" | "mw-modul" | "mw-silent" | "mw-misi"
  // Kuis live (20 Nov 2026, docs/rancangan-kuis-wam.md): a tab of Modul acara.
  | "mw-kuis";
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
  // Main WAM: the app during WAM itself, hidden until its mode is switched (17 Nov 2026).
  { key: "mw-pengaturan", label: "Pengaturan", group: "Main WAM", href: mainWamAdminPath.settings, icon: SlidersHorizontal, summary: "Mode acara, penguji, modul yang aktif, dan tema Main WAM." },
  { key: "mw-isi", label: "Isi acara", group: "Main WAM", href: mainWamAdminPath.rundown, icon: ListChecks, summary: "Rundown, kamar, perjalanan, dan panduan untuk peserta." },
  { key: "mw-kamar", label: "Kamar", group: "Main WAM", href: mainWamAdminPath.rooms, icon: ListChecks, summary: "Lantai dan catatan kamar dari pembagian kamar HR.", owner: "mw-isi" },
  { key: "mw-perjalanan", label: "Perjalanan", group: "Main WAM", href: mainWamAdminPath.travel, icon: ListChecks, summary: "Kumpul, kereta, shuttle, dan kursi tiap orang.", owner: "mw-isi" },
  { key: "mw-panduan", label: "Panduan", group: "Main WAM", href: mainWamAdminPath.guides, icon: ListChecks, summary: "Denah, hotel dan fasilitas, dress code, tata tertib.", owner: "mw-isi" },
  { key: "mw-info", label: "Info acara", group: "Main WAM", href: mainWamAdminPath.eventInfo, icon: ListChecks, summary: "Hotel, alamat, check-in/out, kontak panitia, tagihan hotel untuk Jejak karbon.", owner: "mw-isi" },
  { key: "mw-modul", label: "Modul acara", group: "Main WAM", href: mainWamAdminPath.awards, icon: Trophy, summary: "Kategori dan nominasi Awarding, pertanyaan Silent Meeting, Kuis live." },
  { key: "mw-silent", label: "Silent Meeting", group: "Main WAM", href: mainWamAdminPath.silent, icon: Trophy, summary: "Pertanyaan Silent Meeting per sesi.", owner: "mw-modul" },
  { key: "mw-kuis", label: "Kuis live", group: "Main WAM", href: mainWamAdminPath.quizzes, icon: Trophy, summary: "Soal, pengendali, tautan layar besar, permainan, dan hasil kuis.", owner: "mw-modul" },
  { key: "mw-misi", label: "Misi", group: "Main WAM", href: mainWamAdminPath.missions, icon: Target, summary: "Misi foto, check-in lokasi, dan sesi; poin, bukti peserta, dan Peringkat." },
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
