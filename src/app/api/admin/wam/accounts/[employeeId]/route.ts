import { z } from "zod";
import { praWamRoles } from "@/lib/pra-wam/roles";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { createAccount, listAccounts, resetPassword, setRoles, updateEmail } from "@/lib/server/pra-wam/accounts";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };
const schema = z.object({
  roles: z.array(z.enum(praWamRoles)).max(praWamRoles.length).optional(),
  resetPassword: z.literal(true).optional(),
  email: z.email("Email tidak valid.").max(200).optional(),
});

/** POST: this one person's account, with the shared first password (any admin, so Data karyawan too). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const result = await createAccount(employeeId);
    return success({ ...result, ...(await listAccounts()) }, result.created ? "Akun WAM dibuat." : "Akun belum dibuat.");
  });
}

/**
 * PATCH: one person's roles, their email (also their sign-in), or a reset to the first password
 * (any admin). The email is the only Data karyawan field this changes; NIP and personal details
 * stay with the super admin (/api/admin/employees).
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const body = validate(schema, await readJson(request, 2_000));
    // setRoles refuses (422) a combination the role rule does not allow, such as BOD with Panitia.
    if (body.roles) await setRoles(employeeId, body.roles);
    if (body.email) await updateEmail(employeeId, body.email);
    if (body.resetPassword) await resetPassword(employeeId);
    const message = body.resetPassword ? "Password kembali ke password awal. Orang ini perlu masuk ulang." : body.email ? "Email disimpan. Login memakai email baru." : "Peran disimpan.";
    return success(await listAccounts(), message);
  });
}
