import { z } from "zod";
import { kioskIdentifySchema } from "@/lib/pra-wam/face-kiosk";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { identifyFace } from "@/lib/server/pra-wam/face-kiosk";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: mode tablet, step one. Who the face at panitia's tablet is among the participants. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    // A tablet at the door reads many faces in ten minutes.
    await enforceRateLimit(request, "pra-wam-face-tablet", 900);
    const sessionId = validate(z.uuid(), (await params).id);
    return success(await identifyFace(sessionId, member, validate(kioskIdentifySchema, await readJson(request, 150_000))));
  });
}
