import { managesApp } from "@/lib/pra-wam/roles";
import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveAnswer } from "@/lib/server/pra-wam/questionnaire-answers";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

// The value's shape is checked against its question (cleanAnswer); here only the envelope.
const schema = z.object({ question: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/, "Pertanyaan tidak dikenal."), value: z.unknown() });

/** PUT {question, value}: save one of my named answers; an empty value clears it. */
export async function PUT(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { question, value } = validate(schema, await readJson(request, 20_000));
    // Admin WAM may try a draft before it opens.
    return success(await saveAnswer(member.id, question, value, { preview: managesApp(member) }), "Tersimpan.");
  });
}
