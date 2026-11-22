import { z } from "zod";
import { checkOrigin, enforceRateLimit, handle, success, validate } from "@/lib/server/http";
import { startFaceCheckIn } from "@/lib/server/pra-wam/face-check-in";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * POST: absen pakai wajah, step one (22 Nov 2026), when the camera opens. Go ahead with a token,
 * "sudah" with the check-in that is there, or "tanpa-wajah" for someone without a WG People face.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-face-start", 30);
    const answer = await startFaceCheckIn(validate(z.uuid(), (await params).id), member);
    return success(answer, answer.kind === "sudah" ? "Kehadiranmu sudah tercatat." : answer.kind === "tanpa-wajah" ? answer.message : "Kamera siap.");
  });
}
