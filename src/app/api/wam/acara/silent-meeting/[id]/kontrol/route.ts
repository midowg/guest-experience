import { z } from "zod";
import { silentControlSchema } from "@/lib/main-wam/modul/silent";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { controlSilent, silentCounts } from "@/lib/server/main-wam/modul/silent";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const messages = { buka: "Silent Meeting dibuka.", tutup: "Silent Meeting ditutup.", otomatis: "Silent Meeting kembali mengikuti jam sesi." } as const;

/**
 * POST {action: "buka" | "tutup" | "otomatis"}: panitia opens or closes a Silent Meeting by hand, or
 * hands it back to the session's hours. Used by Rundown live (agen C, K02). Answers the new state.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer } = await requireActionApi("silent-kontrol");
    checkOrigin(request);
    const id = validate(z.uuid("Silent Meeting tidak dikenali."), (await params).id);
    const { action } = validate(silentControlSchema, await readJson(request, 1_000));
    const view = await controlSilent(id, action, viewer, new Date());
    return success({ view, ...(await silentCounts(id)) }, messages[action]);
  });
}
