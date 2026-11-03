import { z } from "zod";
import { praWamRoles } from "@/lib/pra-wam/roles";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";
import { listAccounts, resetPassword, setRoles } from "@/lib/server/pra-wam/accounts";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };
const schema = z.object({ roles: z.array(z.enum(praWamRoles)).max(praWamRoles.length).optional(), resetPassword: z.literal(true).optional() });

/** PATCH: one person's roles, or a reset to the shared first password (super admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const body = validate(schema, await readJson(request, 2_000));
    if (body.roles) await setRoles(employeeId, [...new Set(body.roles)]);
    if (body.resetPassword) await resetPassword(employeeId);
    return success(await listAccounts(), body.resetPassword ? "Password kembali ke password awal. Orang ini perlu masuk ulang." : "Peran disimpan.");
  });
}
