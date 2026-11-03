import { employeeImportSchema } from "@/lib/employees";
import { importEmployees, listEmployees } from "@/lib/server/employees";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** GET: everyone in Data karyawan (super admin). */
export async function GET() {
  return handle(async () => {
    await requireSuperAdmin();
    return success(await listEmployees(), "Data karyawan dimuat.");
  });
}

/** POST: save an import the super admin has looked over (rows from /parse). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const { rows } = validate(employeeImportSchema, await readJson(request, 1_000_000));
    const result = await importEmployees(rows);
    return success(result, `${result.added} karyawan baru, ${result.updated} diperbarui, ${result.unchanged} tetap.`);
  });
}
