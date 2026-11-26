import { wibClock, wibDay } from "@/lib/coffee/quota";
import type { Status } from "@/lib/coffee/types";

/* How the employee app writes times and statuses (the office's own clock, WIB). Pure. */

/** "09.14". */
export const clock = (iso: string): string => wibClock(iso).replace(":", ".");
/** "25 Nov". */
export function dayShort(iso: string): string {
  const [year, month, day] = wibDay(iso).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
}

export type Tone = "wait" | "ok" | "no" | "off";
/** The pill of a claim that is shown in full (the prototype's words). */
export const STATUS_PILL: Record<Status, { label: string; tone: Tone }> = {
  diproses: { label: "Diproses", tone: "wait" },
  selesai: { label: "Siap diambil", tone: "ok" },
  ditolak: { label: "Ditolak", tone: "no" },
  batal: { label: "Dibatalkan", tone: "off" },
};
/** In "Sebelumnya" a done claim is simply done: it was picked up long ago. */
export const HISTORY_PILL: Record<Status, { label: string; tone: Tone }> = { ...STATUS_PILL, selesai: { label: "Selesai", tone: "ok" } };
export const STATUS_TITLE: Record<Status, string> = {
  diproses: "Pengajuan sedang diproses", selesai: "Silakan ambil di mesin", ditolak: "Pengajuan tidak bisa diproses", batal: "Pengajuan dibatalkan",
};
