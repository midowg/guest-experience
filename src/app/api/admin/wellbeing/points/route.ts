import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { addPoints, wellbeingActor } from "@/lib/server/wellbeing/admin";
import { pointBatchSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

/** POST: Tambah poin (or take points) for many people at once, as one batch that can be undone. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(pointBatchSchema, await readJson(request, 40_000));
    const result = await addPoints(input, await wellbeingActor());
    return success(result, `${input.points > 0 ? "+" : ""}${input.points} poin untuk ${result.count} orang.`);
  });
}
