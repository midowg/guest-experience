import { z } from "zod";
import { praWamRoles } from "@/lib/pra-wam/roles";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { rolesOf } from "@/lib/server/pra-wam/session";
import { createAccount, listAccounts, resetPassword, setRoles, updateEmail } from "@/lib/server/pra-wam/accounts";
import { leadsSchema } from "@/lib/pra-wam/leads";
import { setLeads } from "@/lib/server/pra-wam/leads";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };
const schema = z.object({
  roles: z.array(z.enum(praWamRoles)).max(praWamRoles.length).optional(),
  resetPassword: z.literal(true).optional(),
  email: z.email("Email tidak valid.").max(200).optional(),
  /** HOD departemen dan lead BU (6 Nov 2026). */
  leads: leadsSchema.optional(),
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
    const admin = await requireApiAdmin();
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const body = validate(schema, await readJson(request, 2_000));
    // The structure (BOD, Admin WAM, HOD, lead BU) is the super admin's, in Data karyawan (6 Nov 2026);
    // Admin WAM only picks Panitia.
    if (admin !== "super") {
      if (body.leads) throw new ServiceError(403, "HOD dan lead BU diatur super admin di Data karyawan.");
      if (body.roles) {
        const current = await rolesOf(employeeId);
        if ((["bod", "admin"] as const).some(role => current.includes(role) !== body.roles!.includes(role))) {
          throw new ServiceError(403, "BOD dan Admin WAM diatur super admin di Data karyawan.");
        }
      }
    }
    // Rules: a BOD heads nothing, and is neither Panitia nor Admin WAM (422 otherwise). Clearing what
    // someone heads goes first, so the same save can make them BOD; otherwise the roles first.
    const clearsLeads = !!body.leads && body.leads.departments.length + body.leads.businessUnits.length === 0;
    if (body.leads && clearsLeads) await setLeads(employeeId, body.leads);
    if (body.roles) await setRoles(employeeId, body.roles);
    if (body.email) await updateEmail(employeeId, body.email);
    if (body.leads && !clearsLeads) await setLeads(employeeId, body.leads);
    if (body.resetPassword) await resetPassword(employeeId);
    const message = body.resetPassword ? "Password kembali ke password awal. Orang ini perlu masuk ulang." : body.email ? "Email disimpan. Login memakai email baru."
      : body.leads || body.roles ? "Peran dan struktur disimpan." : "Disimpan.";
    return success(await listAccounts(), message);
  });
}
