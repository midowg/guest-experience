import { z } from "zod";
import { requestInputSchema } from "@/lib/pra-wam/requests";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { requestChange } from "@/lib/server/pra-wam/requests";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: ask panitia to move this session. Nothing changes until panitia approves. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-request", 10);
    const id = validate(z.uuid(), (await params).id);
    return success(await requestChange(id, validate(requestInputSchema, await readJson(request, 4_000)), member), "Permintaan terkirim ke panitia.");
  });
}
