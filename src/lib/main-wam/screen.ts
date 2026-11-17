import { MAIN_WAM_PATH, mainWamPath } from "@/lib/routes";

/*
 * What Main WAM's frame draws for a screen, from its address alone (SPEC §1.2), so the bars in the
 * shared layout never wait for the page: the lit tab, the level, and for a detail or task screen its
 * back target and title. The shell (UI kit, src/components/main-wam/shell) reads this on the client
 * with usePathname; every screen of every area is listed here now (KONTRAK §5), so no agent edits it.
 *
 * Levels:
 *   akar    tab root: top bar (Beranda: greeting and bell), bottom bar.
 *   detail  reading a level deeper: back arrow and title, the bottom bar stays (its tab lit).
 *   tugas   a form, the camera, a result: close (x) or no top bar, no bottom bar.
 * `dark`: Momen's black viewer (M01–M03, U01–U05). `back.href` is the fallback when there is no
 * history to go back to (opened from a notification or a QR).
 */

export const MAIN_WAM_TABS = ["beranda", "agenda", "momen", "saya"] as const;
export type MainWamTab = (typeof MAIN_WAM_TABS)[number];
export type MainWamLevel = "akar" | "detail" | "tugas";
/** `title` "" = a bar without a title (revisi 16 Nov "Kepala tanpa judul"); `label` then names the screen for screen readers. */
export type MainWamScreen = { tab: MainWamTab | null; level: MainWamLevel; title: string; label?: string; back?: { href: string; title: string }; dark?: boolean };

/** The four tabs, in order: label, address and the Lucide icon name (SPEC §0.3). */
export const mainWamTabs: { key: MainWamTab; label: string; href: string; icon: "house" | "calendar-days" | "images" | "user-round" }[] = [
  { key: "beranda", label: "Beranda", href: mainWamPath.home, icon: "house" },
  { key: "agenda", label: "Agenda", href: mainWamPath.agenda(), icon: "calendar-days" },
  { key: "momen", label: "Momen", href: mainWamPath.moments(), icon: "images" },
  { key: "saya", label: "Saya", href: mainWamPath.me, icon: "user-round" },
];

const strip = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);
const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
const rest = (path: string, base: string) => (path.startsWith(`${base}/`) ? path.slice(base.length + 1) : "");

const home = { href: mainWamPath.home, title: "Beranda" };
const agenda = { href: mainWamPath.agenda(), title: "Agenda" };
const momen = { href: mainWamPath.moments(), title: "Momen" };
const saya = { href: mainWamPath.me, title: "Saya" };

/** The frame of a Main WAM address; null outside Main WAM (or for its sign-in page, which has no frame). */
export function mainWamScreen(pathname: string): MainWamScreen | null {
  const path = strip(pathname);
  if (!under(path, MAIN_WAM_PATH)) return null;
  const sub = rest(path, MAIN_WAM_PATH);
  if (!sub) return { tab: "beranda", level: "akar", title: "Beranda" };
  const [first, second, third] = sub.split("/");
  switch (first) {
    case "masuk": return null;
    case "mulai": return { tab: null, level: "tugas", title: "Notifikasi" };
    case "notifikasi": return { tab: "beranda", level: "detail", title: "Notifikasi", back: home };
    // P04: the bar has only ‹ (revisi 16 Nov); the session's own title is the screen's headline.
    case "agenda": return second ? { tab: "agenda", level: "detail", title: "", label: "Detail sesi", back: agenda } : { tab: "agenda", level: "akar", title: "Agenda" };
    case "momen":
      if (!second) return { tab: "momen", level: "akar", title: "Momen", dark: true };
      if (second === "kamera") return { tab: "momen", level: "tugas", title: "Kamera", back: momen, dark: true };
      if (second === "galeri") return { tab: "momen", level: "detail", title: "Galeri", back: momen };
      if (second === "mozaik") return { tab: "momen", level: "detail", title: "Mozaik WAM 2026", back: momen };
      return { tab: "momen", level: "detail", title: "Momen", back: momen };
    case "saya": {
      if (!second) return { tab: "saya", level: "akar", title: "Saya" };
      const titles: Record<string, string> = { kelompok: "Kelompok & kamar", perjalanan: "Perjalanan", panduan: "Panduan", pengaturan: "Pengaturan" };
      if (second === "panduan" && third) return { tab: "saya", level: "detail", title: "Panduan", back: { href: mainWamPath.guides, title: "Panduan" } };
      return { tab: "saya", level: "detail", title: titles[second] ?? "Saya", back: saya };
    }
    case "kelola": {
      if (second === "pengumuman") return { tab: "beranda", level: "tugas", title: "Pengumuman baru", back: home };
      const titles: Record<string, string> = { rundown: "Rundown live", absen: "Absen sesi", moderasi: "Moderasi Momen" };
      return { tab: "beranda", level: "detail", title: titles[second] ?? "Kelola", back: home };
    }
    case "ringkasan": {
      const titles: Record<string, string> = { kehadiran: "Kehadiran", "silent-meeting": "Rekap Silent Meeting", awarding: "Awarding" };
      return { tab: "beranda", level: "detail", title: titles[second] ?? "Ringkasan", back: home };
    }
    case "absen": return { tab: "agenda", level: "tugas", title: "Absen", back: agenda };
    case "silent-meeting": return { tab: "agenda", level: "tugas", title: "Silent Meeting", back: agenda };
    case "awarding": return second
      ? { tab: "beranda", level: "tugas", title: "Pilih nominasi", back: { href: mainWamPath.awards, title: "Awarding" } }
      : { tab: "beranda", level: "detail", title: "Awarding", back: home };
  }
  return { tab: null, level: "detail", title: "WAM", back: home };
}

/** Whether the bottom bar shows on this screen (tab roots and details; never tasks). */
export const showsBottomBar = (screen: MainWamScreen | null) => !!screen && screen.level !== "tugas";
/** The bell is on Beranda's root only (SPEC revisi 16 Nov). */
export const showsBell = (screen: MainWamScreen | null) => screen?.tab === "beranda" && screen.level === "akar";
