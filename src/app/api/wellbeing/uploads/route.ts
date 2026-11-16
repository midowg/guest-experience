import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { startUpload } from "@/lib/server/wellbeing/member";
import { uploadStartSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

/** POST {mime, size}: agree one proof photo and answer where the browser puts it (ten minutes) and its token. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    // Per person: the whole office shares one address; up to five photos an activity.
    await enforceRateLimit(request, `wellbeing-upload:${member.id}`, 30);
    return success(await startUpload(member, validate(uploadStartSchema, await readJson(request, 1_000))), "Siap mengunggah.");
  });
}
