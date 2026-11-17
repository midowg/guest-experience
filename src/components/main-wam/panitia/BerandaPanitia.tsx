import type { MainWamContext } from "@/lib/server/main-wam/gate";

/**
 * K01: the panitia's cards on Beranda, under Sekarang: Kelola (4 shortcuts: Rundown live, Absen,
 * Pengumuman, Moderasi with its badge; Absen only with the module on) and Perlu perhatian (only when
 * there is something). SLOT (fondasi): owner agen C; agen A's Beranda renders it as it is, so keep
 * the name and props. Returns nothing for anyone who is not panitia or admin (mainWamCan "kelola").
 */
export async function BerandaPanitia({ context, now }: { context: MainWamContext; now: Date }) {
  void context; void now;
  return null;
}
