import type { MainWamContext } from "@/lib/server/main-wam/gate";

/**
 * P01: the Momen card on Beranda: a small stack "12 foto baru" with Lihat (→ Momen) and Ambil foto
 * (→ Kamera). SLOT (fondasi): owner agen B; agen A's Beranda renders it as it is, so keep the name
 * and props.
 */
export async function BerandaMomen({ context, now }: { context: MainWamContext; now: Date }) {
  void context; void now;
  return null;
}
