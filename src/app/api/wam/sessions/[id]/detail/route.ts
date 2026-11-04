import { z } from "zod";
import { ServiceError } from "@/lib/server/config";
import { handle, success, validate } from "@/lib/server/http";
import { sessionView } from "@/lib/server/pra-wam/agenda";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** GET: everything Detail sesi shows (the sheet over Agenda and Beranda reads it when it opens). */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    const view = await sessionView(validate(z.uuid(), (await params).id), member);
    if (!view) throw new ServiceError(404, "Sesi tidak ditemukan.");
    return success(view, "Sesi dimuat.");
  });
}
