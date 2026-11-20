import { kindLabels, submitSchema } from "@/lib/hr/attendance";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { submitClockIn } from "@/lib/server/hr/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: step three. Judged again on the server; one masuk and one pulang per day. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "hr-absen-submit", 30);
    const answer = await submitClockIn(member, validate(submitSchema, await readJson(request, 150_000)));
    const label = kindLabels[answer.record.kind].toLowerCase();
    return success(answer, answer.kind === "sudah" ? `Absen ${label} hari ini sudah tercatat.` : `Absen ${label} tercatat.`);
  });
}
