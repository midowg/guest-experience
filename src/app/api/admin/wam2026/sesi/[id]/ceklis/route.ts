import { checklistInputSchema } from "@/lib/main-wam/ceklis/ceklis";
import { isId } from "@/lib/main-wam/admin/requests";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveChecklist } from "@/lib/server/main-wam/admin/ceklis";
import { adminSessions } from "@/lib/server/main-wam/admin/sessions";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * PUT {required, items}: an agenda's whole checklist (any Admin WAM admin). The list replaces the
 * old one (an item that keeps its id keeps its ticks), and "wajib lengkap sebelum absen" is saved
 * with it. Answers with the whole rundown again, like every Rundown save.
 */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = await params;
    if (!isId(id)) throw new ServiceError(404, "Sesi tidak ditemukan.");
    const input = validate(checklistInputSchema, await readJson(request, 100_000));
    await saveChecklist(id, input);
    const { data } = await adminSessions();
    return success({ sessions: data }, "Ceklis tersimpan.");
  });
}
