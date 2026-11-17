import { photoStartSchema } from "@/lib/main-wam/momen/filters";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { startUpload } from "@/lib/server/main-wam/momen/upload";

export const dynamic = "force-dynamic";

/**
 * POST {clientId, audience, sessionId, takenAt, width, height, size, thumbSize, tileSize}: three
 * upload addresses (besar, kecil, ubin; type and size signed) and a token, or the photo already kept.
 * Limits per person: 30 photos per 10 minutes, 200 a day.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const context = await requireActionApi("foto");
    checkOrigin(request);
    const input = validate(photoStartSchema, await readJson(request, 2_000));
    return success(await startUpload(context, input), "Siap mengirim.");
  });
}
