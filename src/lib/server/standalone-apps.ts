import "server-only";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { BOOKING_PATH, bookingPath, praWamPath, wamAdminPath } from "@/lib/routes";
import { currentPhase } from "./pra-wam/events";
import { openResetRequestCount } from "./pra-wam/reset-requests";

/**
 * The standalone apps (10 Nov 2026): the ones that run on their own at a fixed address, apart from
 * the events and their invitations: WAM, Booking Kantor and TV Announcement. They head the admin's
 * event list in one "Aplikasi" section, with the Your Visit guide beside them.
 */
export type StandaloneApp = {
  key: "wam" | "booking" | "tv";
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
  const [phase, resets] = await Promise.all([
    currentPhase(wibDate(now.toISOString())).catch(() => null),
    openResetRequestCount().catch(() => null),
  ]);
  return [
    {
      key: "wam", name: "WAM 2027", eyebrow: "Aplikasi karyawan",
      status: phase ? `${phase.kind === "pra_wam" ? "Minggu Pra WAM" : phase.name} · ${short(phase.startDate)}–${short(phase.endDate)}${phase.daysToWam ? ` · WAM ${phase.daysToWam} hari lagi` : ""}` : "Werkudara Annual Meeting, 4–7 Jan 2027",
      address: praWamPath.home,
      description: "Login per karyawan: agenda, appraisal, booking ruang, absen QR, dokumen, dan pengumuman. Panitia mengelola sesi dari dalam aplikasi.",
      open: { label: "Buka aplikasi", href: praWamPath.home }, manage: { label: "Kelola WAM", href: wamAdminPath.home },
      ...(resets ? { waiting: { label: `${resets} permintaan reset password`, href: wamAdminPath.resetRequests } } : {}),
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
  ];
}
