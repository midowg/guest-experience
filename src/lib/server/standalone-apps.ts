import "server-only";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { PRA_WAM_ADMIN_LABEL, WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { mainWamModeLabels } from "@/lib/main-wam/types";
import { BOOKING_PATH, bookingPath, COFFEE_PATH, coffeeAdminPath, coffeePath, employeesAdminPath, HR_PATH, hrAdminPath, hrPath, mainWamAdminPath, praWamPath, wamAdminPath, WELLBEING_PATH, wellbeingAdminPath, wellbeingPath } from "@/lib/routes";
import { currentPhase } from "./pra-wam/events";
import { openResetRequestCount } from "./pra-wam/reset-requests";
import { readMainWamSettings } from "./main-wam/settings";
import { waitingCount } from "./hr/attendance";
import { waitingCount as coffeeWaitingCount } from "./coffee/queue";
import { listEmployees } from "./employees";

/**
 * The standalone apps (10 Nov 2026): the ones that run on their own at a fixed address, apart from
 * the events and their invitations: WAM, Booking Kantor and TV Announcement. They head the admin's
 * event list in one "Aplikasi" section, with the Your Visit guide beside them. Wellbeing joined on
 * 16 Nov 2026; since 17 Nov 2026 its card opens the employee app (/wlm since 18 Nov 2026), which is not yet
 * announced: the old app stays the official one until then. Main WAM joined on 20 Nov 2026 as its own card
 * (key wam_acara): managed in Admin WAM 2026, given apart from Admin Pra WAM (the WAM card).
 */
export type StandaloneApp = {
  key: "wam" | "wam_acara" | "booking" | "tv" | "wellbeing" | "hr" | "coffee" | "karyawan";
  name: string;
  /** What kind of app, on its preview. */
  eyebrow: string;
  /** Where it stands, as the badge says it. */
  status: string;
  /** Its fixed address, as shown. */
  address: string;
  description: string;
  /** Left out when the app has no link from the admin (WAM 2026: reached by its address only). */
  open?: { label: string; href: string };
  manage: { label: string; href: string };
  /** Something waiting on an admin, when there is. */
  waiting?: { label: string; href: string };
};

const short = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export async function standaloneApps(now = new Date()): Promise<StandaloneApp[]> {
  const [phase, resets, mainWam, hrWaiting, coffeeWaiting, people] = await Promise.all([
    currentPhase(wibDate(now.toISOString())).catch(() => null),
    openResetRequestCount().catch(() => null),
    readMainWamSettings().catch(() => null),
    waitingCount().catch(() => null),
    // Before migration 202612010001 (or on a database hiccup) the card simply shows no count.
    coffeeWaitingCount().catch(() => null),
    listEmployees().then(({ employees }) => employees.filter(person => person.active).length).catch(() => null),
  ]);
  return [
    {
      key: "wam", name: "Pra WAM", eyebrow: "Aplikasi karyawan",
      status: phase ? `${phase.kind === "pra_wam" ? "Minggu Pra WAM" : phase.name} · ${short(phase.startDate)}–${short(phase.endDate)}${phase.daysToWam ? ` · WAM ${phase.daysToWam} hari lagi` : ""}` : "Werkudara Annual Meeting, 4–7 Jan 2027",
      address: praWamPath.home,
      description: "Login per karyawan: agenda, appraisal, booking ruang, absen QR, dokumen, dan pengumuman. Panitia mengelola sesi dari dalam aplikasi.",
      open: { label: "Buka aplikasi", href: praWamPath.home }, manage: { label: `Kelola di ${PRA_WAM_ADMIN_LABEL}`, href: wamAdminPath.home },
      ...(resets ? { waiting: { label: `${resets} permintaan reset password`, href: wamAdminPath.resetRequests } } : {}),
    },
    {
      key: "wam_acara", name: "WAM", eyebrow: "Aplikasi selama acara",
      status: mainWam ? `Mode ${mainWamModeLabels[mainWam.mode]}` : "Aplikasi selama acara WAM",
      address: "",
      description: "Aplikasi selama acara WAM: rundown, kamar, perjalanan, panduan, Awarding, Silent Meeting, dan Kuis live, dengan Panitia WAM-nya sendiri.",
      manage: { label: `Kelola ${WAM_EVENT_ADMIN_LABEL}`, href: mainWamAdminPath.home },
    },
    {
      // WG People (20 Nov 2026): the employees' HR app, managed in Admin HR (/admin/hr).
      key: "hr", name: "WG People", eyebrow: "Aplikasi HR karyawan",
      status: hrWaiting ? `${hrWaiting} absen perlu dicek` : "Absensi wajah dan titik kantor",
      address: HR_PATH,
      description: "Karyawan absen masuk dan pulang dari HP dengan wajah dan titik kantor. Admin HR memeriksa absen yang perlu dicek, wajah terdaftar, dan titik kantor; nanti cuti dan lembur.",
      open: { label: "Buka aplikasi", href: hrPath.home }, manage: { label: "Kelola di Admin HR", href: hrAdminPath.home },
      ...(hrWaiting ? { waiting: { label: `${hrWaiting} absen perlu dicek`, href: hrAdminPath.waiting } } : {}),
    },
    {
      // WG Coffee (25 Nov 2026): claims of the office JumpStart machine, processed in /admin/coffee.
      key: "coffee", name: "WG Coffee", eyebrow: "Aplikasi karyawan",
      status: coffeeWaiting ? `${coffeeWaiting} pesanan menunggu diproses` : "Klaim minuman dan pesanan rapat",
      address: COFFEE_PATH,
      description: "Karyawan mengajukan klaim minuman JumpStart dari HP dengan jatah per bulan; GA mengirim pesanan rapat untuk tamu dan tim. Pengelola memproses antrean, mencatat manual, dan mengunduh rekap.",
      open: { label: "Buka aplikasi", href: coffeePath.home }, manage: { label: "Kelola WG Coffee", href: coffeeAdminPath.home },
      ...(coffeeWaiting ? { waiting: { label: `${coffeeWaiting} pesanan menunggu diproses`, href: coffeeAdminPath.home } } : {}),
    },
    {
      // Data karyawan (27 Nov 2026): admin only, so no address and no "Buka aplikasi"; it was in Super admin.
      key: "karyawan", name: "Data karyawan", eyebrow: "Khusus admin",
      status: people !== null ? `${people} karyawan aktif` : "Data karyawan bersama",
      address: "",
      description: "Satu daftar karyawan untuk semua aplikasi Journey: tambah, ubah, dan hapus karyawan, struktur organisasi, dan impor Excel dari HR.",
      manage: { label: "Kelola Data karyawan", href: employeesAdminPath.home },
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
