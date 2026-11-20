import { membersInputSchema } from "@/lib/main-wam/admin/groups";
import { isId } from "@/lib/main-wam/admin/requests";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { setGroupMembers } from "@/lib/server/main-wam/admin/groups";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PUT {employeeIds, coordinatorId}: exactly these members (people in another kelompok move here). */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = await params;
    if (!isId(id)) throw new ServiceError(404, "Kelompok tidak ditemukan.");
    const input = validate(membersInputSchema, await readJson(request, 20_000));
    return success(await setGroupMembers(id, input), "Anggota kelompok tersimpan.");
  });
}
