import { z } from "zod";
import { questionSchema, type QuestionInput } from "@/lib/main-wam/kuis/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { addQuestion } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {level, body, options, correct}: a question, last of its level. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid("Kuis tidak dikenali."), (await params).id);
    await addQuestion(id, validate(questionSchema, await readJson(request, 5_000)) as QuestionInput);
    return success(null, "Soal ditambahkan.");
  });
}
