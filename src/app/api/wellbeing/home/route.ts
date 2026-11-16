import { handle, success } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { home } from "@/lib/server/wellbeing/member";

export const dynamic = "force-dynamic";

/** GET: Wellbeing → Beranda for the signed-in person (totals, place, streak, week, recent activities, rules). */
export async function GET() {
  return handle(async () => success(await home(await requireApiMember()), "Beranda dimuat."));
}
