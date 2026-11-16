import { handle, success } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { ledger } from "@/lib/server/wellbeing/member";

export const dynamic = "force-dynamic";

/** GET: every point that counts for me, newest first (activities and points from the admin), with the total. */
export async function GET() {
  return handle(async () => success(await ledger(await requireApiMember()), "Riwayat poin dimuat."));
}
