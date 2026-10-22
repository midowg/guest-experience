import { z } from "zod";
import { photoPatchSchema } from "@/lib/gallery";
import { deletePhoto, updatePhoto } from "@/lib/server/gallery";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; photoId: string }> };
const ids = async (params: Params["params"]) => { const { id, photoId } = await params; return { id: validate(z.uuid(), id), photoId: validate(z.uuid(), photoId) }; };

/** PATCH: review (tayang/sembunyikan), caption, alt text, or order. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, photoId } = await ids(params);
    await requireEventAccess(id);
    return success(await updatePhoto(id, photoId, validate(photoPatchSchema, await readJson(request, 5_000))), "Foto diperbarui.");
  });
}

/** DELETE: the photo and its three files. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, photoId } = await ids(params);
    await requireEventAccess(id);
    await deletePhoto(id, photoId);
    return success(null, "Foto dihapus.");
  });
}
