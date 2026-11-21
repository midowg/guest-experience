import { silentQuestionSchema } from "@/lib/main-wam/modul/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { adminSilent, createQuestion } from "@/lib/server/main-wam/modul/admin";

export const dynamic = "force-dynamic";

/** GET: the Silent Meeting questions with their state; how many sent only once closed from 5 feedbacks of 5 people (never the text). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await adminSilent(), "");
  });
}

/** POST {sessionId, question, topics}: one question for one session. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(silentQuestionSchema, await readJson(request, 5_000));
    return success(await createQuestion(input), "Pertanyaan Silent Meeting tersimpan.");
  });
}
