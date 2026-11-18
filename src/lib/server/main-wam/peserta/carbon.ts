import "server-only";
import { carbonView, type CarbonView } from "@/lib/main-wam/peserta/carbon";
import type { MainWamContext } from "../gate";
import { readLang } from "../lang";
import { carbonForEvent } from "../panitia/carbon";

/*
 * Jejak karbon for the person (E01 and the Beranda card): the estimate Admin WAM's data already
 * gives (panitia/carbon.ts, nobody fills a form), said in the person's language. It never throws: a
 * failed read or nothing to count yet is "belum", and the screens say so kindly.
 */

export async function loadCarbon({ settings }: Pick<MainWamContext, "settings">, now: Date): Promise<CarbonView> {
  const lang = await readLang();
  const result = await carbonForEvent(settings).catch(() => null);
  return carbonView(result, now, lang);
}
