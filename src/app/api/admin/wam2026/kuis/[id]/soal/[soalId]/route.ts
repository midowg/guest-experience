import { z } from "zod";
import { questionSchema, type QuestionInput } from "@/lib/main-wam/kuis/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteQuestion, updateQuestion } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; soalId: string }> };
const idsOf = async ({ params }: Params) => {
  const { id, soalId } = await params;
  return { id: validate(z.uuid("Kuis tidak dikenali."), id), questionId: validate(z.uuid("Soal tidak dikenali."), soalId) };
};

/** PATCH {level, body, options, correct}: games already made keep their own copy. */
export async function PATCH(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, questionId } = await idsOf(context);
    await updateQuestion(id, questionId, validate(questionSchema, await readJson(request, 5_000)) as QuestionInput);
    return success(null, "Soal tersimpan.");
  });
}

export async function DELETE(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, questionId } = await idsOf(context);
    await deleteQuestion(id, questionId);
    return success(null, "Soal dihapus.");
  });
}
