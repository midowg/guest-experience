import type { MwSession } from "@/lib/main-wam/types";
import type { MainWamContext } from "@/lib/server/main-wam/gate";

/**
 * P04: what a module adds to Detail sesi, each only while its module is on:
 * - `absen`: the Absen card of a session marked "pakai absen" (Absen dibuka sampai …, the Absen
 *   button to the scanner, "Hadir 07.52 · Scan QR", lewat tanpa absen; BOD: "Hadir 96 dari 120");
 * - `aksi`: the session's module action (Silent Meeting "Kirim masukan", Awarding "Pilih nominasi",
 *   Survei "Isi survei").
 * SLOTS (fondasi): owner agen D; agen A's Detail sesi renders both as they are, so keep the names
 * and props. Nothing when the module is off or the session has none.
 */
export async function SessionAbsen({ session, context, now }: { session: MwSession; context: MainWamContext; now: Date }) {
  void session; void context; void now;
  return null;
}
export async function SessionModuleAction({ session, context, now }: { session: MwSession; context: MainWamContext; now: Date }) {
  void session; void context; void now;
  return null;
}
