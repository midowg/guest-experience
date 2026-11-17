import { announcementPatchSchema } from "@/lib/main-wam/panitia/schemas";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { removeAnnouncement, unpinAnnouncement } from "@/lib/server/main-wam/panitia/announce";
import { apiOnlyFor, limitPerPerson } from "@/lib/server/main-wam/panitia/common";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const announcementId = async ({ params }: Params) => {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceError(404, "Pengumuman ini sudah tidak ada.");
  return id;
};

/** PATCH {pinnedUntil: null}: Lepas dari Beranda (panitia). */
export async function PATCH(request: Request, params: Params) {
  return handle(async () => {
    const context = apiOnlyFor(await requireMainWamApi(), "kelola");
    checkOrigin(request);
    const id = await announcementId(params);
    validate(announcementPatchSchema, await readJson(request, 1_000));
    await limitPerPerson("pengumuman-ubah", context.viewer.id, 60);
    await unpinAnnouncement(context, id);
    return success({ id }, "Dilepas dari Beranda.");
  });
}

/** DELETE: remove an announcement from everyone's lonceng (panitia). */
export async function DELETE(request: Request, params: Params) {
  return handle(async () => {
    const context = apiOnlyFor(await requireMainWamApi(), "kelola");
    checkOrigin(request);
    const id = await announcementId(params);
    await limitPerPerson("pengumuman-ubah", context.viewer.id, 60);
    await removeAnnouncement(id);
    return success({ id }, "Pengumuman dihapus.");
  });
}
