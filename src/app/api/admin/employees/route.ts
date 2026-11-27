import { employeeCreateSchema, employeeImportSchema } from "@/lib/employees";
import { autoAccounts } from "@/lib/server/pra-wam/accounts";
import { createEmployee, importEmployees, listEmployees } from "@/lib/server/employees";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** GET: everyone in Data karyawan (the super admin, or the Data karyawan grant). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await listEmployees(), "Data karyawan dimuat.");
  });
}

/** POST: save an import the super admin has looked over (rows from /parse), or with `employee` add one person by hand. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const body = await readJson(request, 1_000_000) as { employee?: unknown };
    if (body && typeof body === "object" && "employee" in body) {
      const saved = await createEmployee(validate(employeeCreateSchema, body.employee));
      // Their sign-in at once (27 Nov 2026): the same account opens every employee app.
      const accounts = await autoAccounts([saved.id]);
      return success({ ...saved, accounts }, `${saved.full_name} ditambahkan.${accounts?.note ? ` ${accounts.note}` : ""}`);
    }
    const { rows } = validate(employeeImportSchema, body);
    const result = await importEmployees(rows);
    // Everyone active without a sign-in gets one, the newcomers of this import among them.
    const accounts = await autoAccounts("all");
    return success({ ...result, accounts }, `${result.added} karyawan baru, ${result.updated} diperbarui, ${result.unchanged} tetap.${accounts?.note ? ` ${accounts.note}` : ""}`);
  });
}
