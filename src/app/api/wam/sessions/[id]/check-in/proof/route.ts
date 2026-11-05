import { z } from "zod";
import { proofStartSchema } from "@/lib/pra-wam/attendance";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { startProofUpload } from "@/lib/server/pra-wam/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * POST {mime, size}: online check-in, step one. Agrees the Zoom screenshot's type and size and
 * answers where the browser puts it, only while "Saya hadir" could be recorded now.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-check-in-proof", 20);
    const sessionId = validate(z.uuid(), (await params).id);
    const answer = await startProofUpload(sessionId, validate(proofStartSchema, await readJson(request, 1_000)), member);
    return success(answer, answer.kind === "sudah" ? "Kehadiranmu sudah tercatat." : "Siap mengunggah.");
  });
}
