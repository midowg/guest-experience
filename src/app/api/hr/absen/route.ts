import { handle, success } from "@/lib/server/http";
import { appState } from "@/lib/server/hr/leave";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** GET: the person's absensi today, their face status, the office points, the last 31 days, and their requests. */
export async function GET() {
  return handle(async () => success(await appState(await requireApiMember()), ""));
}
