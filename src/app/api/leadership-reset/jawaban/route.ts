import { z } from "zod";
import { answerInputSchema, KEY_PATTERN } from "@/lib/leadership-reset/form";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { readOwnAnswer, saveAnswer } from "@/lib/server/leadership-reset";
import { ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";

/** PUT {key, name, team, targetStatus, answers}: a leader saves their reflection (new, or changed while the form is open). No sign-in: the key is theirs. */
export async function PUT(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    // One office shares one address, so the limit is generous: it only stops a flood.
    await enforceRateLimit(request, "leadership-reset-save", 120);
    const saved = await saveAnswer(validate(answerInputSchema, await readJson(request, 60_000)));
    return success(saved, "Jawaban tersimpan.");
  });
}

/** POST {key}: read my answer back (the key goes in the body, never in an address). */
export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    const { key } = validate(z.object({ key: z.string().regex(KEY_PATTERN) }), await readJson(request, 1_000));
    const answer = await readOwnAnswer(key);
    if (!answer) throw new ServiceError(404, "Jawaban untuk tautan ini tidak ditemukan. Mungkin sudah dihapus panitia.");
    return success(answer, "");
  });
}
