import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { createQuestion, questionCreateSchema } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";

/** POST: a new question at the end of a section, with a new fixed key (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { result, id } = await createQuestion(validate(questionCreateSchema, await readJson(request, 40_000)));
    return success({ ...result, createdId: id }, "Pertanyaan ditambahkan.");
  });
}
