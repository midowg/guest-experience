import { z } from "zod";
import { faceCheckInSchema } from "@/lib/pra-wam/attendance";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { submitFaceCheckIn } from "@/lib/server/pra-wam/face-check-in";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: step three. The face is judged again on the server; cocok and perlu cek are recorded. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-face-submit", 20);
    const sessionId = validate(z.uuid(), (await params).id);
    const answer = await submitFaceCheckIn(sessionId, member, validate(faceCheckInSchema, await readJson(request, 150_000)));
    const message = answer.kind === "tidak-cocok" ? "Wajah belum cocok." : answer.kind === "sudah" ? "Kehadiranmu sudah tercatat." : "Absen tercatat.";
    return success(answer, message);
  });
}
