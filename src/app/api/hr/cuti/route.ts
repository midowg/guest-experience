import { isMonth, leaveSchema } from "@/lib/hr/leave";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { createLeave, teamLeaves } from "@/lib/server/hr/leave";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";

/** GET ?bulan=YYYY-MM: the team's waiting and approved cuti, sakit, izin and dinas that month (no notes). */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    const month = new URL(request.url).searchParams.get("bulan");
    if (!isMonth(month)) throw new ServiceError(422, "Bulan tidak dikenali.");
    return success(await teamLeaves(member, month), "");
  });
}

/** POST {type, startDate, endDate, note}: an employee asks Admin HR for cuti, sakit, izin or dinas. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "hr-cuti", 30);
    const created = await createLeave(member, validate(leaveSchema, await readJson(request, 2_000)));
    return success(created, "Pengajuan terkirim. Admin HR akan memeriksanya.");
  });
}
