import { z } from "zod";
import { finishUpload } from "@/lib/server/gallery";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** POST: after the three uploads, check size and file type; the photo then awaits review. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, photoId } = await params;
    const eventId = validate(z.uuid(), id);
    await requireEventAccess(eventId);
    return success(await finishUpload(eventId, validate(z.uuid(), photoId)), "Foto terunggah dan menunggu tinjauan.");
  });
}
