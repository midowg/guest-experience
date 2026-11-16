import { z } from "zod";
import { handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ACTIVITY_FILTERS, ACTIVITY_KINDS, listActivities } from "@/lib/server/wellbeing/admin";

export const dynamic = "force-dynamic";
const query = z.object({
  filter: z.enum(ACTIVITY_FILTERS).default("unchecked"),
  kind: z.enum(ACTIVITY_KINDS).default("all"),
  q: z.string().trim().max(80).optional(),
  before: z.string().max(120).optional(),
  employee: z.uuid().optional(),
});

/** GET: Admin Wellbeing → Periksa, newest first, 24 at a time (?before= for the next page). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const input = validate(query, Object.fromEntries(new URL(request.url).searchParams));
    return success(await listActivities({ filter: input.filter, kind: input.kind, q: input.q, before: input.before, employeeId: input.employee }), "Aktivitas dimuat.");
  });
}
