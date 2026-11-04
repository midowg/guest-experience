import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { questionPatchSchema, removeQuestion, updateQuestion } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH: a question's fields, a move to another section included; its key never changes (any admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    return success(await updateQuestion(id, validate(questionPatchSchema, await readJson(request, 40_000))), "Pertanyaan disimpan.");
  });
}

/** DELETE: removes a question, or hides it once it has answers (any admin). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { result, hidden } = await removeQuestion(validate(z.uuid(), (await params).id));
    return success(result, hidden ? "Pertanyaan ini sudah punya jawaban, jadi disembunyikan, tidak dihapus." : "Pertanyaan dihapus.");
  });
}
