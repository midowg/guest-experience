import { handle, success } from "@/lib/server/http";
import { clockInState } from "@/lib/server/hr/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** GET: the person's absensi today, their face status, the office points, and the last 14 days. */
export async function GET() {
  return handle(async () => success(await clockInState(await requireApiMember()), ""));
}
