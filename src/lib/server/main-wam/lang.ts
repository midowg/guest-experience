import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { LANG_COOKIE, translator, parseLang, type Lang, type Translate } from "@/lib/main-wam/i18n";

/*
 * The language of this device: the `mw_lang` cookie (Pengaturan → Bahasa writes it), Indonesian
 * when it is missing or anything else. Read once per request. A server component says its texts
 * with `const t = await serverT()`; a route handler reads it with readLang() too.
 */

export const readLang = cache(async (): Promise<Lang> => {
  try {
    return parseLang((await cookies()).get(LANG_COOKIE)?.value);
  } catch {
    return "id"; // outside a request (a build, a test without cookies)
  }
});

export async function serverT(): Promise<Translate> {
  return translator(await readLang());
}
