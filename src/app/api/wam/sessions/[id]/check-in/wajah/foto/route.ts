import { z } from "zod";
import { faceUploadSchema } from "@/lib/pra-wam/attendance";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { startFacePhoto } from "@/lib/server/pra-wam/face-check-in";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {token, mime, size}: step two, where the browser puts the photo (private storage). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-face-photo", 30);
    const sessionId = validate(z.uuid(), (await params).id);
    return success(await startFacePhoto(sessionId, member, validate(faceUploadSchema, await readJson(request, 1_000))), "Siap mengunggah.");
  });
}
