import { unitsFromSheets } from "@/lib/pra-wam/units";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { importUnits, listUnits } from "@/lib/server/pra-wam/units";
import { readXlsx, XlsxError } from "@/lib/server/xlsx";

export const dynamic = "force-dynamic";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST (form field "file", .xlsx): units and positions from the "Unit dan jabatan" sheet. Every
 * membership is replaced by what the sheet says; the file is read in memory and not kept. Any
 * admin may run it: it matches people by the NIP in the uploaded sheet but only writes WAM units,
 * and answers with unit names, job titles and counts, never Data karyawan's own fields.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const form = await request.formData().catch(() => { throw new ServiceError(400, "Unggahan tidak terbaca."); });
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ServiceError(400, "Pilih berkas Excel (.xlsx).");
    if (file.size > MAX_BYTES) throw new ServiceError(413, "Berkas lebih dari 5 MB.");
    let parsed;
    try { parsed = unitsFromSheets(readXlsx(Buffer.from(await file.arrayBuffer()))); }
    catch (error) { if (error instanceof XlsxError) throw new ServiceError(400, error.message); throw new ServiceError(400, "Berkas Excel tidak terbaca."); }
    if (!parsed.members.length) throw new ServiceError(400, "Tidak ada sheet dengan kolom Jenis unit dan Unit.");
    const result = await importUnits(parsed);
    // Warnings (a BOD the sheet makes a department lead) join the skipped list the page shows.
    return success({ ...result, skipped: [...parsed.skipped, ...result.warnings], ...(await listUnits()) }, `${result.units} unit dan ${result.members} keanggotaan tersimpan${result.unmatched.length ? `; ${result.unmatched.length} nama tidak ditemukan` : ""}${result.warnings.length ? `; ${result.warnings.length} tanda lead BOD dilewati` : ""}.`);
  });
}
