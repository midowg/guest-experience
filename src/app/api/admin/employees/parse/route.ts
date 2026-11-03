import { compareImport, employeesFromSheets } from "@/lib/employees";
import { listEmployees } from "@/lib/server/employees";
import { readXlsx, XlsxError } from "@/lib/server/xlsx";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST (form field "file", .xlsx): reads HR's sheet and answers what an import would do. Nothing
 * is saved; the file is read in memory and not kept.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const form = await request.formData().catch(() => { throw new ServiceError(400, "Unggahan tidak terbaca."); });
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ServiceError(400, "Pilih berkas Excel (.xlsx).");
    if (file.size > MAX_BYTES) throw new ServiceError(413, "Berkas lebih dari 5 MB.");
    let parsed;
    try { parsed = employeesFromSheets(readXlsx(Buffer.from(await file.arrayBuffer()))); }
    catch (error) { if (error instanceof XlsxError) throw new ServiceError(400, error.message); throw new ServiceError(400, "Berkas Excel tidak terbaca."); }
    if (!parsed.rows.length) throw new ServiceError(400, "Tidak ada sheet dengan kolom Nama karyawan dan Jabatan atau Departemen.");
    const { employees, migrated } = await listEmployees();
    return success({ sheet: parsed.sheet, skipped: parsed.skipped, migrated, plan: compareImport(parsed.rows, employees) }, `${parsed.rows.length} karyawan terbaca dari sheet ${parsed.sheet}.`);
  });
}
