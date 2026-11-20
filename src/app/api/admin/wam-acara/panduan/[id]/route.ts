import { guideUpdateSchema } from "@/lib/main-wam/admin/guides";
import { isId } from "@/lib/main-wam/admin/requests";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteGuide, updateGuide } from "@/lib/server/main-wam/admin/guides";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

async function guideId(params: Params["params"]): Promise<string> {
  const { id } = await params;
  if (!isId(id)) throw new ServiceError(404, "Panduan tidak ditemukan.");
  return id;
}

/** PUT {kind, title, body, sort, published, removeFile?}. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await guideId(params);
    const { removeFile, ...input } = validate(guideUpdateSchema, await readJson(request, 40_000));
    return success(await updateGuide(id, input, removeFile === true), removeFile ? "Panduan tersimpan, berkasnya dihapus." : "Panduan tersimpan.");
  });
}

/** DELETE: the guide and its file. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await guideId(params);
    return success(await deleteGuide(id), "Panduan dihapus.");
  });
}
