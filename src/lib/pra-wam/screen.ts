import { praWamPath } from "@/lib/routes";
import { safePraWamNext } from "./next-path";

export type Tab = "beranda" | "agenda" | "appraisal" | "timeline" | "dokumen" | "notifikasi" | "akun" | "dashboard" | "sesi" | "permintaan" | "pengumuman" | "peserta" | "survei" | "kebutuhan" | "hod" | "materi";
export type Back = { href: string; title: string };
export type Screen = { current?: Tab; back?: Back };

type Viewer = { id: string; bod: boolean };
type Search = { get(name: string): string | null };

/** Every place in "Kelola acara", also those without a bottom bar item of their own (Peserta, Survei). */
export const managedTabs: ReadonlySet<Tab> = new Set<Tab>(["dashboard", "sesi", "permintaan", "pengumuman", "kebutuhan", "peserta", "survei", "materi"]);

const tail = (pathname: string, base: string) => (pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : null);

/**
 * What the frame shows for a WAM screen, from its address alone: the tab that is lit and, for a
 * pushed (detail) screen, its back arrow and title. The frame lives in the shared layout
 * (src/app/wam/(app)/layout.tsx) and stays put while the page under it loads, so it cannot wait
 * for the page: everything here is known before the page's data is.
 *
 * `cameFromPanitia`: the screen before was in "Kelola acara". A session's detail then stays in
 * Kelola acara with its back arrow to Jadwal sesi; opened from anywhere else (the agenda, a
 * notification, a QR) it belongs to the agenda.
 */
export function wamScreen(pathname: string, search: Search, viewer: Viewer, cameFromPanitia = false): Screen {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  switch (path) {
    case praWamPath.home: return { current: "beranda" };
    case praWamPath.agenda: return { current: "agenda" };
    case praWamPath.documents: return { current: "dokumen" };
    case praWamPath.timeline: return { current: "timeline" };
    case praWamPath.account: return { current: "akun" };
    // Pengaturan (9 Nov 2026): a screen of its own with the bottom bar, no back arrow to Profil.
    case praWamPath.settings: return { current: "akun" };
    case praWamPath.about: return { back: { href: search.get("dari") === "pengaturan" ? praWamPath.settings : praWamPath.home, title: "Tentang WAM" } };
    case praWamPath.notifications: return { current: "notifikasi", back: { href: praWamPath.home, title: "Notifikasi" } };
    case praWamPath.scan: return { current: "agenda", back: { href: praWamPath.agenda, title: "Scan QR absen" } };
    case praWamPath.newPassword(): return { back: { href: safePraWamNext(search.get("next")) ?? praWamPath.home, title: "Keamanan akun" } };
    case praWamPath.colleagues: return { back: { href: praWamPath.home, title: "Kartu rekan" } };
    case praWamPath.appraisal(): return { current: "appraisal" };
    case praWamPath.hod: return { current: "appraisal" };
    // Booking is a view of its own (9 Nov 2026): a new one belongs to Timeline (whose calendar opens
    // it); changing one of Agenda's bookings goes back there.
    case praWamPath.book(): return search.get("edit")
      ? { current: "appraisal", back: { href: praWamPath.appraisal(), title: "Ubah booking" } }
      : { current: "timeline", back: { href: praWamPath.timeline, title: "Book ruang" } };
    case praWamPath.dashboard: return { current: "dashboard" };
    case praWamPath.sessions: return { current: "sesi" };
    case praWamPath.newSession: return { current: "sesi", back: { href: praWamPath.sessions, title: "Buat sesi" } };
    case praWamPath.requests: return { current: "permintaan" };
    case praWamPath.announcements: return { current: "pengumuman" };
    case praWamPath.needs: return { current: "kebutuhan" };
    case praWamPath.people: return { current: "peserta" };
    case praWamPath.surveyResults: return { current: "survei" };
    case praWamPath.manageDocuments: return { current: "materi" };
  }
  const session = tail(path, praWamPath.sessions);
  if (session) return { current: "sesi", back: { href: praWamPath.sessions, title: session.endsWith("/attendance") ? "QR dan daftar hadir" : "Ubah sesi" } };
  if (tail(path, praWamPath.people)) return { current: viewer.bod ? undefined : "peserta", back: { href: praWamPath.people, title: "Profil peserta" } };
  if (tail(path, praWamPath.session("").slice(0, -1))) {
    // Opened from Kelola acara (?dari=kelola, 9 Nov 2026) or right after a Kelola acara screen.
    return cameFromPanitia || search.get("dari") === "kelola"
      ? { current: "sesi", back: { href: praWamPath.sessions, title: "Detail sesi" } }
      : { current: "agenda", back: { href: praWamPath.agenda, title: "Detail sesi" } };
  }
  if (tail(path, praWamPath.scan)) return { current: "agenda", back: { href: praWamPath.agenda, title: "Absen sesi" } };
  const colleague = tail(path, praWamPath.colleagues);
  if (colleague) return { back: { href: praWamPath.colleagues, title: decodeURIComponent(colleague) === viewer.id ? "Kartumu" : "Profil rekan" } };
  return {};
}
