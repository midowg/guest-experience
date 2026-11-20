import { z } from "zod";
import { quizSchema } from "@/lib/main-wam/kuis/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { adminQuiz, deleteQuiz, renameQuiz } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idOf = async ({ params }: Params) => validate(z.uuid("Kuis tidak dikenali."), (await params).id);

/** GET: one quiz with its questions (with keys), pengendali and games. */
export async function GET(_request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const quiz = await adminQuiz(await idOf(context));
    if (!quiz) throw new ServiceError(404, "Kuis tidak ditemukan.");
    return success(quiz, "");
  });
}

/** PATCH {title}. */
export async function PATCH(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { title } = validate(quizSchema, await readJson(request, 2_000));
    await renameQuiz(await idOf(context), title);
    return success(null, "Judul tersimpan.");
  });
}

/** DELETE: the quiz with its questions, games and answers (not while a game is going on). */
export async function DELETE(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await deleteQuiz(await idOf(context));
    return success(null, "Kuis dihapus.");
  });
}
