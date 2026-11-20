import { z } from "zod";
import { actionSchema } from "@/lib/main-wam/kuis/admin";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { controlAct, controlState } from "@/lib/server/main-wam/kuis/control";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idOf = async ({ params }: Params) => validate(z.uuid("Kuis tidak dikenali."), (await params).id);

/** GET: the MC's view (pengendali of the quiz or Admin WAM; anyone else: 404). */
export async function GET(_request: Request, context: Params) {
  return handle(async () => {
    const gate = await requireModuleApi("kuis");
    return success(await controlState(gate, await idOf(context)), "");
  });
}

/** POST {runId, rev, action}: Lanjut's step, Jeda, Lanjutkan, Batalkan soal, Papan skor sekarang, on the rev the MC saw. */
export async function POST(request: Request, context: Params) {
  return handle(async () => {
    const gate = await requireModuleApi("kuis");
    checkOrigin(request);
    const input = validate(actionSchema, await readJson(request, 1_000));
    const { snapshot, message } = await controlAct(gate, await idOf(context), input);
    return success(snapshot, message);
  });
}
