import { z } from "zod";
import { photoDeleteSchema } from "@/lib/main-wam/momen/filters";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { deletePhoto } from "@/lib/server/main-wam/momen/upload";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * DELETE (optional {clientId}): Batalkan or Hapus foto, by the photo's owner only (403 for someone
 * who sees it, 404 otherwise). Panitia remove others' photos through moderation (K08,
 * mainWamApi.moderatePhoto), never here (audit M2). A photo nominated for Awarding: 409 (audit M3).
 * With the clientId, an upload cancelled before it was kept has its files removed.
 */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("foto");
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const body = request.headers.get("content-type")?.startsWith("application/json") ? validate(photoDeleteSchema, await readJson(request, 500)) : {};
    await deletePhoto(context, id, body.clientId);
    return success({ id }, "Foto dihapus.");
  });
}
