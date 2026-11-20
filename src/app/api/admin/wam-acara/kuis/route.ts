import { quizSchema } from "@/lib/main-wam/kuis/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { adminQuizzes, createQuiz, actorName } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";

/** GET: the quizzes of Kuis live (Admin WAM 2027 → Kuis live). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await adminQuizzes(), "");
  });
}

/** POST {title}: a new quiz (its questions, pengendali and big screen come next). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { title } = validate(quizSchema, await readJson(request, 2_000));
    return success(await createQuiz(title, await actorName()), "Kuis dibuat. Tambahkan soalnya.");
  });
}
