import { uploadStartSchema } from "@/lib/hr/attendance";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { startUpload } from "@/lib/server/hr/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST {token, mime, size}: where the selfie (or the enrolment photo) goes, for this nonce only. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "hr-absen-upload", 30);
    return success(await startUpload(member, validate(uploadStartSchema, await readJson(request, 1_000))), "Siap mengunggah.");
  });
}
