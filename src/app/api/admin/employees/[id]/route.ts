import { z } from "zod";
import { employeePatchSchema } from "@/lib/employees";
import { updateEmployee } from "@/lib/server/employees";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH: change one person's details (super admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    return success(await updateEmployee(id, validate(employeePatchSchema, await readJson(request, 20_000))), "Data karyawan disimpan.");
  });
}
