import { activityPutSchema, isId } from "@/lib/main-wam/admin/requests";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteActivityGroup, updateActivityGroup } from "@/lib/server/main-wam/admin/groups";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

async function groupId(params: Params["params"]): Promise<string> {
  const { id } = await params;
  if (!isId(id)) throw new ServiceError(404, "Kelompok kegiatan tidak ditemukan.");
  return id;
}

/** PUT {group, employeeIds?}: its fields, and its people when given. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await groupId(params);
    const input = validate(activityPutSchema, await readJson(request, 20_000));
    return success(await updateActivityGroup(id, input.group, input.employeeIds), `${input.group.label} tersimpan.`);
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await groupId(params);
    return success(await deleteActivityGroup(id), "Kelompok kegiatan dihapus.");
  });
}
