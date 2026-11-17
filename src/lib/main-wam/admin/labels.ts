import type { ActivityGroupKind, GuideKind, SessionKind, SessionModule, SessionStatus, TripDirection, TripKind } from "../types";

/* Labels Admin WAM → Main WAM shows for Main WAM's kinds and statuses (sentence case, 1–2 words). */

export const sessionKindLabels: Record<SessionKind, string> = { sesi: "Sesi", makan: "Makan", perjalanan: "Perjalanan" };
export const sessionStatusLabels: Record<SessionStatus, string> = { draf: "Draf", terbit: "Terbit", batal: "Batal" };
export const sessionModuleLabels: Record<SessionModule | "none", string> = { none: "Tidak ada", silent: "Silent Meeting", voting: "Awarding", survei: "Survei" };
export const activityKindLabels: Record<ActivityGroupKind, string> = { pos: "Pos", angkot: "Angkot", meja: "Meja", lain: "Lainnya" };
export const tripDirectionLabels: Record<TripDirection, string> = { berangkat: "Berangkat", pulang: "Pulang" };
export const tripKindLabels: Record<TripKind, string> = { kumpul: "Titik kumpul", kereta: "Kereta", bus: "Bus atau shuttle", tiba: "Tiba", lain: "Lainnya" };
export const guideKindLabels: Record<GuideKind, string> = { denah: "Denah", hotel: "Hotel & fasilitas", dresscode: "Dress code", tata_tertib: "Tata tertib", lain: "Lainnya" };

/** The migration of agen E (atomic kelompok, kelompok kegiatan and kursi changes). */
export const MAIN_WAM_ADMIN_MIGRATION = "202611200501_main_wam_admin.sql";

/** "Sen, 4 Jan" of a WIB date ("2027-01-04"). */
export const shortDate = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)).replace(/\./g, "");
