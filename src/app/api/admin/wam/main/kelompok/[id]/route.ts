import { groupInputSchema } from "@/lib/main-wam/admin/groups";
import { isId } from "@/lib/main-wam/admin/requests";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteGroup, updateGroup } from "@/lib/server/main-wam/admin/groups";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

async function groupId(params: Params["params"]): Promise<string> {
  const { id } = await params;
  if (!isId(id)) throw new ServiceError(404, "Kelompok tidak ditemukan.");
  return id;
}

/** PUT {number, name}: renumber or rename a kelompok. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await groupId(params);
    const input = validate(groupInputSchema, await readJson(request, 2_000));
    return success(await updateGroup(id, input), "Kelompok tersimpan.");
  });
}

/** DELETE: the kelompok goes, its people have none (refused once it has Momen photos for its members). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await groupId(params);
    return success(await deleteGroup(id), "Kelompok dihapus.");
  });
}
