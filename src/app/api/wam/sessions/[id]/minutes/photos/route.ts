import { z } from "zod";
import { momPhotoStartSchema } from "@/lib/pra-wam/minutes-photos";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { startMinutePhoto } from "@/lib/server/pra-wam/minutes-photos";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {size, width, height}: agree a meeting photo's upload (12 Nov 2026) and answer where the browser puts it. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-mom-photo", 40);
    const id = validate(z.uuid(), (await params).id);
    return success(await startMinutePhoto(id, validate(momPhotoStartSchema, await readJson(request, 1_000)), member), "Siap mengunggah.");
  });
}
