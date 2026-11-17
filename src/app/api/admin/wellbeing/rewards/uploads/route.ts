import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { startRewardUpload } from "@/lib/server/wellbeing/rewards";
import { uploadStartSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

/** POST { mime, size }: where the browser puts one reward photo (ten minutes), and its token. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    return success(await startRewardUpload(validate(uploadStartSchema, await readJson(request, 1_000))), "Siap mengunggah.");
  });
}