import { ServiceError } from "@/lib/server/config";
import { handle, success } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { limitPerson } from "@/lib/server/main-wam/modul/rate";
import { loadRoommate } from "@/lib/server/main-wam/peserta/roommate";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * GET: a roommate's profile for Kamar's sheet (answers marked "Rekan bisa lihat ini" only). 401 without a
 * session; 404 for anyone not in the viewer's own room, oneself, or someone not active: one answer for all.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireMainWamApi();
    const { id } = await params;
    await limitPerson("kamar", context.viewer.id, 120);
    const view = await loadRoommate(context, id);
    if (!view) throw new ServiceError(404, "Halaman tidak ditemukan.");
    return success({ view }, "Profil dimuat.");
  });
}
