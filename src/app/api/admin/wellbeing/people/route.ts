import { z } from "zod";
import { handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { listPeople } from "@/lib/server/wellbeing/admin";

export const dynamic = "force-dynamic";
const query = z.object({ period: z.enum(["month", "all"]).default("month") });

/** GET: Admin Wellbeing → Karyawan: every active employee with their points (this month or all time). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const { period } = validate(query, Object.fromEntries(new URL(request.url).searchParams));
    return success(await listPeople(period), "Karyawan dimuat.");
  });
}
