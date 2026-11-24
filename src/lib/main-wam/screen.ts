import { MAIN_WAM_PATH, mainWamPath } from "@/lib/routes";
import { t, type Lang } from "./i18n";

/*
 * What Main WAM's frame draws for a screen, from its address alone (SPEC §1.2), so the bars in the
 * shared layout never wait for the page: the lit tab, the level, and for a detail or task screen its
 * back target and title. The shell (UI kit, src/components/main-wam/shell) reads this on the client
 * with usePathname; every screen of every area is listed here now (KONTRAK §5), so no agent edits it.
 *
 * Levels:
 *   akar    tab root (Beranda, Agenda, Momen, Saya, and Panitia for panitia): top bar (Beranda: greeting and
 *           bell), the bottom bar. Only a tab root draws the bottom bar.
 *   detail  a page opened from somewhere (revisi 24 Nov): back arrow and title, no bottom bar (its tab is
 *           kept only as the screen's family).
 *   tugas   a form, the camera, a result: close (x) or no top bar, no bottom bar.
 * `camera`: the camera (U01–U05) only. It draws its own bar and controls, so the frame draws no bars; it follows
 * the app's theme like every screen (only the live picture is natural). `back.href` is the fallback when there is no
 * history to go back to (opened from a notification or a QR).
 */

export const MAIN_WAM_TABS = ["beranda", "agenda", "momen", "saya", "panitia"] as const;
export type MainWamTab = (typeof MAIN_WAM_TABS)[number];
export type MainWamLevel = "akar" | "detail" | "tugas";
/** `title` "" = a bar without a title (revisi 16 Nov "Kepala tanpa judul"); `label` then names the screen for screen readers. */
export type MainWamScreen = { tab: MainWamTab | null; level: MainWamLevel; title: string; /** A small capital label over a tab-root title ("MOMEN" over "TERBARU"). */ eyebrow?: string; label?: string; back?: { href: string; title: string }; camera?: boolean };

type TabIcon = "house" | "calendar-days" | "images" | "user-round" | "clipboard-list";
type TabDef = { key: MainWamTab; label: string; href: string; icon: TabIcon };
/** The four tabs everyone has, in order: label, address and the Lucide icon name (SPEC §0.3). */
export const mainWamTabs: TabDef[] = [
  { key: "beranda", label: "Beranda", href: mainWamPath.home, icon: "house" },
  { key: "agenda", label: "Agenda", href: mainWamPath.agenda(), icon: "calendar-days" },
  { key: "momen", label: "Momen", href: mainWamPath.moments(), icon: "images" },
  { key: "saya", label: "Saya", href: mainWamPath.me, icon: "user-round" },
];

/** The fifth tab, at the right end after Saya: only for people who are panitia (mainWamShowsCommitteeTab). */
export const mainWamCommitteeTab: TabDef = { key: "panitia", label: "Panitia", href: mainWamPath.committee, icon: "clipboard-list" };
/** The tabs the bar draws: the four, plus Panitia for someone who is panitia. */
export const mainWamTabsFor = (committee: boolean): TabDef[] => (committee ? [...mainWamTabs, mainWamCommitteeTab] : mainWamTabs);

const strip = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);
const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
const rest = (path: string, base: string) => (path.startsWith(`${base}/`) ? path.slice(base.length + 1) : "");


/**
 * The frame of a Main WAM address; null outside Main WAM (or for its sign-in page, which has no frame).
 * The titles of the participant screens follow `lang`; the panitia and BOD screens stay Indonesian.
 */
export function mainWamScreen(pathname: string, lang: Lang = "id"): MainWamScreen | null {
  const path = strip(pathname);
  if (!under(path, MAIN_WAM_PATH)) return null;
  const sub = rest(path, MAIN_WAM_PATH);
  const say = (key: Parameters<typeof t>[1]) => t(lang, key);
  const home = { href: mainWamPath.home, title: say("screen.home") };
  const agenda = { href: mainWamPath.agenda(), title: say("screen.agenda") };
  const momen = { href: mainWamPath.moments(), title: say("screen.moments") };
  const saya = { href: mainWamPath.me, title: say("screen.me") };
  if (!sub) return { tab: "beranda", level: "akar", title: say("screen.home") };
  const [first, second, third] = sub.split("/");
  switch (first) {
    case "masuk": return null;
    case "jejak-karbon": return second === "saya"
      ? { tab: "saya", level: "detail", title: say("screen.carbon"), back: saya }
      : { tab: "beranda", level: "detail", title: say("screen.carbon"), back: home };
    case "misi":
      if (!second) return { tab: "beranda", level: "detail", title: say("screen.missions"), back: home };
      if (second === "peringkat") return { tab: "beranda", level: "detail", title: say("screen.rank"), back: { href: mainWamPath.missions, title: say("screen.missions") } };
      return { tab: "beranda", level: "tugas", title: say("screen.missionDo"), back: { href: mainWamPath.missions, title: say("screen.missions") } };
    case "mulai": return { tab: null, level: "tugas", title: say("screen.notifications") };
    case "notifikasi": return { tab: "beranda", level: "detail", title: say("screen.notifications"), back: home };
    // P04 Detail sesi is a bottom sheet over Agenda (the sheet has its own title and close button), so the frame behind it is Agenda's own.
    case "agenda": return { tab: "agenda", level: "akar", title: say("screen.agenda") };
    case "momen":
      if (!second) return { tab: "momen", level: "akar", title: say("screen.latest"), eyebrow: say("screen.moments") };
      if (second === "kamera") return { tab: "momen", level: "tugas", title: say("screen.camera"), back: momen, camera: true };
      if (second === "galeri") return { tab: "momen", level: "detail", title: say("screen.gallery"), back: momen };
      if (second === "mozaik") return { tab: "momen", level: "detail", title: say("screen.mosaic"), back: momen };
      return { tab: "momen", level: "detail", title: say("screen.moments"), back: momen };
    case "saya": {
      if (!second) return { tab: "saya", level: "akar", title: say("screen.me") };
      const titles: Record<string, string> = { kamar: say("screen.room"), perjalanan: say("screen.travel"), panduan: say("screen.guides"), pengaturan: say("screen.settings"), bantuan: say("screen.help") };
      if (second === "panduan" && third) return { tab: "saya", level: "detail", title: say("screen.guides"), back: { href: mainWamPath.guides, title: say("screen.guides") } };
      return { tab: "saya", level: "detail", title: titles[second] ?? say("screen.me"), back: saya };
    }
    // The panitia hub is the root of the fifth tab; its tools are details of it (back goes to the hub).
    case "kelola": {
      const hub = { href: mainWamPath.committee, title: say("screen.committee") };
      if (!second) return { tab: "panitia", level: "akar", title: say("screen.committee") };
      if (second === "pengumuman") return { tab: "panitia", level: "tugas", title: "Pengumuman baru", back: hub };
      const titles: Record<string, string> = { rundown: "Rundown live", absen: "Absen sesi", moderasi: "Moderasi Momen" };
      return { tab: "panitia", level: "detail", title: titles[second] ?? say("screen.committee"), back: hub };
    }
    case "absen": return { tab: "agenda", level: "tugas", title: say("screen.checkIn"), back: agenda };
    case "silent-meeting": return { tab: "agenda", level: "tugas", title: say("screen.silent"), back: agenda };
    // Kuis live: the game and the MC's control are tasks (no bottom bar: the game takes the screen).
    case "kuis": return second && third === "kendali"
      ? { tab: "beranda", level: "tugas", title: say("screen.quizControl"), back: home }
      : { tab: "beranda", level: "tugas", title: say("screen.quiz"), back: home };
    case "awarding": return second
      ? { tab: "beranda", level: "tugas", title: say("screen.pickNominee"), back: { href: mainWamPath.awards, title: say("screen.awarding") } }
      : { tab: "beranda", level: "detail", title: say("screen.awarding"), back: home };
  }
  return { tab: null, level: "detail", title: say("screen.fallback"), back: home };
}

/** Whether the bottom bar shows on this screen: the tab roots only (revisi 24 Nov: every page opened from one hides it; a tab root has no back arrow, a page has). */
export const showsBottomBar = (screen: MainWamScreen | null) => !!screen && screen.level === "akar";
/** A session's own address (Detail sesi, /agenda/<id>): a sheet, over whichever screen was open (the address alone does not say which). */
export const isSessionSheetPath = (pathname: string) => { const path = strip(pathname); return under(path, `${MAIN_WAM_PATH}/agenda`) && rest(path, `${MAIN_WAM_PATH}/agenda`).length > 0 && !rest(path, `${MAIN_WAM_PATH}/agenda`).includes("/"); };
/** The bell is on Beranda's root only (SPEC revisi 16 Nov). */
export const showsBell = (screen: MainWamScreen | null) => screen?.tab === "beranda" && screen.level === "akar";
