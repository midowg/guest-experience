import { z } from "zod";
import { agendaSchema } from "@/lib/main-wam/kuis/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { quizAgenda, setQuizAgenda } from "@/lib/server/main-wam/kuis/agenda";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idOf = async ({ params }: Params) => validate(z.uuid("Kuis tidak dikenali."), (await params).id);

/** GET: the agenda item this quiz is tied to, and the rundown to choose from. */
export async function GET(_request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    return success(await quizAgenda(await idOf(context)), "");
  });
}

/** PUT {sessionId | null}: tie the quiz to an agenda item (its Detail sesi gets "Ikut kuis"), or untie. */
export async function PUT(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { sessionId } = validate(agendaSchema, await readJson(request, 1_000));
    await setQuizAgenda(await idOf(context), sessionId);
    return success(null, sessionId ? "Kuis ditautkan ke agenda." : "Tautan ke agenda dilepas.");
  });
}
