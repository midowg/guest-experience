import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, success, validate } from "@/lib/server/http";
import { hrPerson, requireHrUnlocked, sameOriginRead } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

/** GET: one person's HR answers by section (admin + HR unlock). Logged as `lihat` before anything is read. */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    sameOriginRead(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const unlock = await requireHrUnlocked();
    return success(await hrPerson(unlock, employeeId, request), "Jawaban dimuat.");
  });
}
