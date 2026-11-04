import { photoStartSchema } from "@/lib/pra-wam/photo";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { startPhotoUpload } from "@/lib/server/pra-wam/photos";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: agree the new profile photo's type and size, and answer where the browser puts it. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-photo", 20);
    return success(await startPhotoUpload(validate(photoStartSchema, await readJson(request, 1_000)), member), "Siap mengunggah.");
  });
}
