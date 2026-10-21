import { z } from "zod";
import { staffInputSchema } from "@/lib/validation";
import { deleteStaff, updateStaff } from "@/lib/server/staff";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    return success(await updateStaff(id, validate(staffInputSchema, await readJson(request, 20_000))), "Data tim disimpan.");
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    await deleteStaff(validate(z.uuid(), (await params).id));
    return success(null, "Anggota tim dihapus.");
  });
}
