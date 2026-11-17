import type { MainWamContext } from "@/lib/server/main-wam/gate";

/**
 * B01: BOD's Ringkasan card on Beranda, at most 4 rows: Kehadiran hari ini, Awarding perlu
 * persetujuan (module voting), Silent Meeting (module silent), Jejak karbon (module karbon, a number
 * only). A module that is off has no row. SLOT (fondasi): owner agen C; agen A's Beranda renders it
 * as it is, so keep the name and props. Returns nothing for anyone who is not BOD (mainWamCan "ringkasan").
 */
export async function BerandaBod({ context, now }: { context: MainWamContext; now: Date }) {
  void context; void now;
  return null;
}
