import { requestSchema } from "@/lib/hr/attendance";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { createRequest } from "@/lib/server/hr/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: an employee asks Admin HR to fix one absen (forgotten, wrong time, wrong reason, or cancel). */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "hr-revisi", 30);
    const created = await createRequest(member, validate(requestSchema, await readJson(request, 2_000)));
    return success(created, "Revisi terkirim. Admin HR akan memeriksanya.");
  });
}
