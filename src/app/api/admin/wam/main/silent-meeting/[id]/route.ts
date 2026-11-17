import { z } from "zod";
import { silentQuestionSchema } from "@/lib/main-wam/modul/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteQuestion, updateQuestion } from "@/lib/server/main-wam/modul/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idOf = async ({ params }: Params) => validate(z.uuid("Pertanyaan tidak dikenali."), (await params).id);

/** PATCH: the question, its session, topics, Tutup otomatis (question and session stay once feedback came in). */
export async function PATCH(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(silentQuestionSchema, await readJson(request, 5_000));
    return success(await updateQuestion(await idOf(context), input), "Pertanyaan Silent Meeting tersimpan.");
  });
}

/** DELETE: a question without feedback. */
export async function DELETE(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await deleteQuestion(await idOf(context));
    return success(null, "Pertanyaan dihapus.");
  });
}
