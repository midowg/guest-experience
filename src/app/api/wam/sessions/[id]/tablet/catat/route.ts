import { z } from "zod";
import { kioskRecordSchema } from "@/lib/pra-wam/face-kiosk";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { recordKioskFace } from "@/lib/server/pra-wam/face-kiosk";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: mode tablet, step two. The photo is uploaded; the person the server named is recorded. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-face-tablet-record", 600);
    const sessionId = validate(z.uuid(), (await params).id);
    const answer = await recordKioskFace(sessionId, member, validate(kioskRecordSchema, await readJson(request, 10_000)));
    return success(answer, answer.kind === "tercatat" ? "Absen tercatat." : "Sudah tercatat.");
  });
}
