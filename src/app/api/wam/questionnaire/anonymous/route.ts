import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { submitAnonymous } from "@/lib/server/pra-wam/questionnaire-answers";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

const schema = z.object({ answers: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,20}$/), z.unknown()) });

/** POST {answers}: send the anonymous section once; the answers are stored without my name. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { answers } = validate(schema, await readJson(request, 60_000));
    return success(await submitAnonymous(member.id, answers), "Bagian anonim terkirim, tanpa nama.");
  });
}
