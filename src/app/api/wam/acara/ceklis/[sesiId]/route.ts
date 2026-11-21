import { z } from "zod";
import { checklistTickSchema } from "@/lib/main-wam/ceklis/ceklis";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { tickChecklist } from "@/lib/server/main-wam/ceklis/data";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { limitPerson } from "@/lib/server/main-wam/modul/rate";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ sesiId: string }> };

/**
 * POST {itemId, checked} or {all: true}: tick an item of an agenda's checklist (or untick it), or
 * tick them all ("Setuju semua"). Module Ceklis only (404 while it is off). The answer holds the
 * ticked ids of that agenda and its progress.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer } = await requireModuleApi("ceklis");
    checkOrigin(request);
    const { sesiId } = await params;
    if (!z.uuid().safeParse(sesiId).success) throw new ServiceError(404, "Agenda tidak ditemukan.");
    const tick = validate(checklistTickSchema, await readJson(request, 1_000));
    await limitPerson("ceklis", viewer.id, 240);
    return success(await tickChecklist(viewer.id, sesiId, tick), "");
  });
}
