import { THEME_IMAGE_SLOTS, type ThemeImageSlot } from "@/lib/main-wam/types";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { themeImageFile } from "@/lib/server/main-wam/theme";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slot: string }> };

/**
 * GET: one KV image of Main WAM's theme (splash, Beranda's pattern, the Mozaik letters, the icon),
 * through this site so storage stays private. No sign-in: the splash and the sign-in page show it
 * first. The address carries the image's version (mainWamApi.themeImage), so a new image is a new
 * address and the old one may be kept for long.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { slot } = await params;
    const image = (THEME_IMAGE_SLOTS as readonly string[]).includes(slot) ? await themeImageFile(slot as ThemeImageSlot).catch(() => null) : null;
    if (!image) throw new ServiceError(404, "Gambar tidak ditemukan.");
    return new Response(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.type, "Content-Length": String(image.bytes.byteLength), "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable", "X-Robots-Tag": "noindex, nofollow",
      },
    });
  });
}
