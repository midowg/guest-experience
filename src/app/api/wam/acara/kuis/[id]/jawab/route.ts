import { z } from "zod";
import { answerSchema } from "@/lib/main-wam/kuis/admin";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { answerQuestion } from "@/lib/server/main-wam/kuis/play";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * POST {runId, index, choice, tapAt}: an answer, one per person per question (rancangan §2). The reply is
 * the value locked (what a right answer gets) by the server's clock, never right or wrong.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const recvAt = Date.now();
    const gate = await requireModuleApi("kuis");
    checkOrigin(request);
    const quizId = validate(z.uuid("Kuis tidak dikenali."), (await params).id);
    const input = validate(answerSchema, await readJson(request, 1_000));
    return success(await answerQuestion(gate, quizId, input, recvAt), "");
  });
}
