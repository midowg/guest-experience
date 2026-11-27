import { z } from "zod";
import { employeeJobsSchema, employeePatchSchema } from "@/lib/employees";
import { deleteEmployee, updateEmployee } from "@/lib/server/employees";
import { JOBS_GM_MIGRATION, JOBS_MIGRATION, setJobs } from "@/lib/server/employee-jobs";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { autoAccounts } from "@/lib/server/pra-wam/accounts";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * PATCH: change one person's details (the super admin, or the Data karyawan grant). With `jobs` (Pekerjaan, 9 Nov 2026) their jobs
 * too: the Utama job goes to the employees columns and the HOD and Lead jobs to pw_leads; the reply
 * is then `{ employee, jobs, leads, migrated }` instead of the person alone.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const body = await readJson(request, 40_000);
    const { jobs: rawJobs, ...rest } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const patch = validate(employeePatchSchema, rest);
    // Someone given an email or made active again gets their sign-in now (27 Nov 2026), if they had none.
    const said = (accounts: Awaited<ReturnType<typeof autoAccounts>>) => accounts?.note ? ` ${accounts.note}` : "";
    if (rawJobs === undefined) {
      const employee = await updateEmployee(id, patch);
      const accounts = await autoAccounts([id]);
      return success({ ...employee, accounts }, `Data karyawan disimpan.${said(accounts)}`);
    }
    const jobs = validate(employeeJobsSchema, rawJobs);
    if (Object.keys(patch).length) await updateEmployee(id, patch);
    const saved = await setJobs(id, jobs);
    const accounts = await autoAccounts([id]);
    const waits = [
      !saved.migrated && jobs.length > 1 ? `pekerjaan lain menunggu migrasi ${JOBS_MIGRATION}` : "",
      saved.migrated && !saved.gmReady ? `GM, tim, dan atasan HOD menunggu migrasi ${JOBS_GM_MIGRATION} (sementara GM disimpan sebagai HOD)` : "",
    ].filter(Boolean);
    return success({ ...saved, accounts }, `${waits.length ? `Pekerjaan utama disimpan; ${waits.join("; ")}.` : "Data karyawan disimpan."}${said(accounts)}`);
  });
}

/** DELETE: remove one person for good (super admin); refused for someone the apps already hold. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await deleteEmployee(validate(z.uuid(), (await params).id));
    return success(null, "Karyawan dihapus.");
  });
}
