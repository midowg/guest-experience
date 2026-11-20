import "server-only";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { PRA_WAM_ADMIN_LABEL, WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { mainWamModeLabels } from "@/lib/main-wam/types";
import { BOOKING_PATH, bookingPath, mainWamAdminPath, mainWamPath, MAIN_WAM_PATH, praWamPath, wamAdminPath, WELLBEING_PATH, wellbeingAdminPath, wellbeingPath } from "@/lib/routes";
import { currentPhase } from "./pra-wam/events";
import { openResetRequestCount } from "./pra-wam/reset-requests";
import { readMainWamSettings } from "./main-wam/settings";

/**
 * The standalone apps (10 Nov 2026): the ones that run on their own at a fixed address, apart from
 * the events and their invitations: WAM, Booking Kantor and TV Announcement. They head the admin's
 * event list in one "Aplikasi" section, with the Your Visit guide beside them. Wellbeing joined on
 * 16 Nov 2026; since 17 Nov 2026 its card opens the employee app (/wlm since 18 Nov 2026), which is not yet
 * announced: the old app stays the official one until then. Main WAM joined on 20 Nov 2026 as its own card
 * (key wam_acara): managed in Admin WAM 2027, given apart from Admin Pra WAM (the WAM card).
 */
export type StandaloneApp = {
  key: "wam" | "wam_acara" | "booking" | "tv" | "wellbeing";
  name: string;
  /** What kind of app, on its preview. */
  eyebrow: string;
  /** Where it stands, as the badge says it. */
  status: string;
  /** Its fixed address, as shown. */
  address: string;
  description: string;
  open: { label: string; href: string };
  manage: { label: string; href: string };
  /** Something waiting on an admin, when there is. */
  waiting?: { label: string; href: string };
};

const short = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export async function standaloneApps(now = new Date()): Promise<StandaloneApp[]> {
  const [phase, resets, mainWam] = await Promise.all([
    currentPhase(wibDate(now.toISOString())).catch(() => null),
    openResetRequestCount().catch(() => null),
    readMainWamSettings().catch(() => null),
  ]);
  return [
    {
      key: "wam", name: "WAM 2027", eyebrow: "Aplikasi karyawan",
      status: phase ? `${phase.kind === "pra_wam" ? "Minggu Pra WAM" : phase.name} · ${short(phase.startDate)}–${short(phase.endDate)}${phase.daysToWam ? ` · WAM ${phase.daysToWam} hari lagi` : ""}` : "Werkudara Annual Meeting, 4–7 Jan 2027",
      address: praWamPath.home,
      description: "Login per karyawan: agenda, appraisal, booking ruang, absen QR, dokumen, dan pengumuman. Panitia mengelola sesi dari dalam aplikasi.",
      open: { label: "Buka aplikasi", href: praWamPath.home }, manage: { label: `Kelola di ${PRA_WAM_ADMIN_LABEL}`, href: wamAdminPath.home },
      ...(resets ? { waiting: { label: `${resets} permintaan reset password`, href: wamAdminPath.resetRequests } } : {}),
    },
    {
      key: "wam_acara", name: "Main WAM", eyebrow: "Aplikasi acara WAM",
      status: mainWam ? `Mode ${mainWamModeLabels[mainWam.mode]}` : "Aplikasi selama acara WAM",
      address: MAIN_WAM_PATH,
      description: "Aplikasi selama acara WAM: rundown, kamar, perjalanan, panduan, Awarding, Silent Meeting, dan Kuis live, dengan Panitia WAM-nya sendiri.",
      open: { label: "Buka Main WAM", href: mainWamPath.home }, manage: { label: `Kelola di ${WAM_EVENT_ADMIN_LABEL}`, href: mainWamAdminPath.home },
    },
    {
      key: "booking", name: "Booking Kantor", eyebrow: "Booking ruangan",
      status: "Ruang kantor, di luar WAM", address: BOOKING_PATH,
      description: "Booking ruangan kantor untuk semua karyawan dengan akun WAM, berbagi ruang dan jadwal yang sama dengan WAM. Staf administrasi mengelola semua booking.",
      open: { label: "Buka aplikasi", href: bookingPath.home }, manage: { label: "Kelola booking", href: bookingPath.manage() },
    },
    {
      key: "tv", name: "TV Announcement", eyebrow: "Digital signage",
      status: "TV kantor", address: "/tv",
      description: "Kendali signage TV kantor: alamat tiap TV, jadwal ruang hari ini dan minggu ini, gambar pengumuman dan durasinya, mode, serta QR. Semua bisa diatur sendiri.",
      open: { label: "Buka tayangan", href: "/tv" }, manage: { label: "Atur TV", href: wamAdminPath.tv },
    },
    {
      key: "wellbeing", name: "Wellbeing", eyebrow: "Program karyawan",
      status: "Aplikasi karyawan · belum diumumkan", address: WELLBEING_PATH,
      description: "Program wellbeing kantor: karyawan masuk dengan akun WAM, mencatat aktivitas per dimensi, dan mengumpulkan poin. Admin memeriksa aktivitas, memberi poin ke banyak orang, dan melihat juara bulanan.",
      open: { label: "Buka aplikasi", href: wellbeingPath.home }, manage: { label: "Kelola Wellbeing", href: wellbeingAdminPath() },
    },
  ];
}
