import { z } from "zod";
import { moveSchema } from "@/lib/main-wam/kuis/admin";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { moveQuestion } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; soalId: string }> };

/** POST {direction: naik|turun}: within its level (levels always run easy to very hard). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, soalId } = await params;
    const { direction } = validate(moveSchema, await readJson(request, 500));
    await moveQuestion(validate(z.uuid("Kuis tidak dikenali."), id), validate(z.uuid("Soal tidak dikenali."), soalId), direction);
    return success(null, "Urutan tersimpan.");
  });
}
