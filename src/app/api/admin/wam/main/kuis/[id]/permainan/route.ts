import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { newRun, actorName } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: a new game with the questions as they are now; a game not over ends (its results stay). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const run = await newRun(validate(z.uuid("Kuis tidak dikenali."), (await params).id), await actorName());
    return success(run, `Permainan ${run.number} siap. Pengendali membuka lobinya dari aplikasi.`);
  });
}
