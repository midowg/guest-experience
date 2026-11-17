import { ServiceError } from "@/lib/server/config";
import { handle, success } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { loadSession } from "@/lib/server/main-wam/peserta/agenda";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** GET: one session as Detail sesi shows it; a draft or an unknown id is not found. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireMainWamApi();
    const { id } = await params;
    const data = await loadSession(context, id, new Date());
    if (!data) throw new ServiceError(404, "Sesi tidak ditemukan.");
    return success({ view: data.view, contact: data.contact, denah: data.denah }, "Sesi dimuat.");
  });
}
