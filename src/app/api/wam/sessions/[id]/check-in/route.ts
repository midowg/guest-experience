import { z } from "zod";
import { selfCheckInSchema } from "@/lib/pra-wam/attendance";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { selfCheckIn } from "@/lib/server/pra-wam/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * POST {mode: "offline"} or {mode: "online", proof: {key, token, size, mime}}: "Saya hadir" from
 * Detail sesi. A second time answers "sudah tercatat" with the check-in that is there.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-self-check-in", 30);
    const sessionId = validate(z.uuid(), (await params).id);
    const answer = await selfCheckIn(sessionId, member, validate(selfCheckInSchema, await readJson(request, 2_000)));
    return success(answer, answer.kind === "sudah" ? "Kehadiranmu sudah tercatat." : "Absen tercatat.");
  });
}
