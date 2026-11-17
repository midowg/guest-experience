import { themeImageAudience } from "@/lib/main-wam/theme-image";
import { THEME_IMAGE_SLOTS, type ThemeImageSlot } from "@/lib/main-wam/types";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { readMainWamSettings } from "@/lib/server/main-wam/settings";
import { mayOpenThemeImages, themeImageBytes } from "@/lib/server/main-wam/theme";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slot: string }> };

const notThere = () => new ServiceError(404, "Gambar tidak ditemukan.");
/** A day: the address carries the version, but a removed KV should not live on in caches for a year (audit L6). */
const MAX_AGE = 86_400;

/**
 * GET ?v=: one KV image of Main WAM's theme, through this site so storage stays private.
 * - Who (audit M6, R9): in mode semua the splash and the icon to anyone (they show before signing
 *   in); everything else, and every slot in mode pra/uji, only to whom Main WAM is shown (a signed-in
 *   penguji, or everyone signed in in mode semua) and to Admin WAM. Anyone else: 404, as if none.
 * - Which (audit L6): only the active version; an old or made-up `v` is 404 and never cached.
 * - Cost (audit L3): the bytes are kept in memory per storage key (themeImageBytes), so a busy
 *   splash does not read storage each time; browsers keep it a day.
 */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const { slot } = await params;
    if (!(THEME_IMAGE_SLOTS as readonly string[]).includes(slot)) throw notThere();
    const settings = await readMainWamSettings();
    const audience = themeImageAudience(settings.mode, slot as ThemeImageSlot);
    if (audience === "member" && !(await mayOpenThemeImages())) throw notThere();
    const image = settings.theme.images[slot as ThemeImageSlot];
    if (!image || new URL(request.url).searchParams.get("v") !== image.version) throw notThere();
    const file = await themeImageBytes(image).catch(() => null);
    if (!file) throw notThere();
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.type, "Content-Length": String(file.bytes.byteLength), "X-Content-Type-Options": "nosniff",
        "Cache-Control": `${audience === "public" ? "public" : "private"}, max-age=${MAX_AGE}`, "X-Robots-Tag": "noindex, nofollow",
        ...(audience === "member" ? { Vary: "Cookie" } : {}),
      },
    });
  });
}
