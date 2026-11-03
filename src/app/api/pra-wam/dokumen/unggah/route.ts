import { documentStartSchema } from "@/lib/pra-wam/documents";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { startUpload } from "@/lib/server/pra-wam/documents";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: agree a document's type and size, and answer where the browser puts it. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-upload", 30);
    return success(await startUpload(validate(documentStartSchema, await readJson(request, 4_000)), member), "Siap mengunggah.");
  });
}
