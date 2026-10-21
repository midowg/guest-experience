import { z } from "zod";
import { uploadRequestSchema } from "@/lib/gallery";
import { startUpload } from "@/lib/server/gallery";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** POST: start one photo upload; returns its id and three signed upload addresses. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    await requireEventAccess(id);
    const input = validate(uploadRequestSchema, await readJson(request, 5_000));
    return success(await startUpload(id, input), "Unggahan disiapkan.");
  });
}
