import { z } from "zod";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { MY_ACTIVITY_FILTERS, logActivity, myActivities } from "@/lib/server/wellbeing/member";
import { logSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";
const query = z.object({
  filter: z.enum(MY_ACTIVITY_FILTERS).default("all"),
  before: z.string().max(120).optional(),
});

/** GET: my activities, newest first, 20 at a time (?filter=all|daily|sport|strava, ?before= for the next page). */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    const input = validate(query, Object.fromEntries(new URL(request.url).searchParams));
    return success(await myActivities(member, input.filter, input.before), "Riwayat dimuat.");
  });
}

/**
 * POST: Catat, one activity with its proof photos (already uploaded). 409 with fieldErrors.code
 * "limit", "same_day" or "strava_twin" (the last may be sent again with force: true).
 */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    // Per person: the whole office shares one address.
    await enforceRateLimit(request, `wellbeing-log:${member.id}`, 30);
    const result = await logActivity(member, validate(logSchema, await readJson(request, 8_000)));
    return success(result, `Tercatat, +${result.activity.points.toLocaleString("id-ID")} poin.`);
  });
}
