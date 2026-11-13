import { z } from "zod";
import { adminGrantSchema } from "@/lib/admin-access";
import { deleteGrant, saveGrant } from "@/lib/server/admin-actor";
import { requireSuperAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ employeeId: string }> };

async function personId(context: Context): Promise<string> {
  const parsed = z.uuid().safeParse((await context.params).employeeId);
  if (!parsed.success) throw new ServiceError(404, "Orang tidak ditemukan.");
  return parsed.data;
}

/** PUT: give or change one person's admin access (super admin). */
export async function PUT(request: Request, context: Context) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const id = await personId(context);
    return success(await saveGrant(id, validate(adminGrantSchema, await readJson(request, 40_000))), "Akses admin disimpan.");
  });
}

/** DELETE: revoke it; their next admin request signs them out (super admin). */
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    await deleteGrant(await personId(context));
    return success(null, "Akses admin dicabut.");
  });
}
