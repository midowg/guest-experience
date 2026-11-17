import { themeImageConfirmSchema } from "@/lib/main-wam/theme-image";
import { themeImageLabels } from "@/lib/main-wam/types";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { confirmThemeImage } from "@/lib/server/main-wam/theme";

export const dynamic = "force-dynamic";

/** POST {slot, mime, size, key, token}: the image is uploaded; check it and put it in its slot. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(themeImageConfirmSchema, await readJson(request, 2_000));
    return success(await confirmThemeImage(input), `Gambar ${themeImageLabels[input.slot]} dipakai.`);
  });
}
