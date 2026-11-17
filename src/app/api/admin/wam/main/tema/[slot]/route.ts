import { THEME_IMAGE_SLOTS, themeImageLabels, type ThemeImageSlot } from "@/lib/main-wam/types";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { removeThemeImage } from "@/lib/server/main-wam/theme";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slot: string }> };

/** DELETE: empty one KV slot; the neutral look returns there. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { slot } = await params;
    if (!(THEME_IMAGE_SLOTS as readonly string[]).includes(slot)) throw new ServiceError(404, "Slot gambar tidak dikenal.");
    return success(await removeThemeImage(slot as ThemeImageSlot), `Gambar ${themeImageLabels[slot as ThemeImageSlot]} dihapus.`);
  });
}
