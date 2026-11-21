import { manualPointsSchema } from "@/lib/main-wam/misi/schema";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { addManualPoints } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";

/** POST {employeeId, points, note}: points by hand (a bonus, or a correction with a minus), always with a reason. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(manualPointsSchema, await readJson(request, 1_000));
    await addManualPoints(input.employeeId, input.points, input.note);
    return success(null, "Poin tercatat.");
  });
}
