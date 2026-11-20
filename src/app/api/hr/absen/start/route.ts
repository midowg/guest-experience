import { startSchema } from "@/lib/hr/attendance";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { startClockIn } from "@/lib/server/hr/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST {kind}: step one: a nonce and its liveness steps (or "sudah", or "daftar" first). */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "hr-absen-start", 30);
    const { kind } = validate(startSchema, await readJson(request, 500));
    return success(await startClockIn(member, kind), "");
  });
}
