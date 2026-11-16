import { handle, success } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { catalog } from "@/lib/server/wellbeing/member";

export const dynamic = "force-dynamic";

/** GET: what can be logged today (daily activities with their limits, sports) and the rules. */
export async function GET() {
  return handle(async () => success(await catalog(await requireApiMember()), "Daftar kegiatan dimuat."));
}
