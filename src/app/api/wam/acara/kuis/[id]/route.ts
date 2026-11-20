import { z } from "zod";
import { joinSchema } from "@/lib/main-wam/kuis/admin";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { joinGame, playState } from "@/lib/server/main-wam/kuis/play";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idOf = async ({ params }: Params) => validate(z.uuid("Kuis tidak dikenali."), (await params).id);

/**
 * GET ?v=: the game as this phone sees it (Kuis live, rancangan §4a): no key, no spread and no score of a
 * question before its answer opens. `v` = the version the phone has; unchanged answers only the clock.
 */
export async function GET(request: Request, context: Params) {
  return handle(async () => {
    const gate = await requireModuleApi("kuis");
    const version = new URL(request.url).searchParams.get("v");
    return success(await playState(gate, await idOf(context), version && version.length <= 120 ? version : null), "");
  });
}

/** POST {runId}: Ikut, as one's tokoh (or Tokoh misterius #NN). */
export async function POST(request: Request, context: Params) {
  return handle(async () => {
    const gate = await requireModuleApi("kuis");
    checkOrigin(request);
    const { runId } = validate(joinSchema, await readJson(request, 1_000));
    return success(await joinGame(gate, await idOf(context), runId), "");
  });
}
