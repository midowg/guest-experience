import { themeImageStartSchema } from "@/lib/main-wam/theme-image";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { startThemeImage } from "@/lib/server/main-wam/theme";

export const dynamic = "force-dynamic";

/** POST {slot, mime, size}: where to upload one KV image, and the token to confirm it with. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(themeImageStartSchema, await readJson(request, 1_000));
    return success(await startThemeImage(input), "Siap diunggah.");
  });
}
