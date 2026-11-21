import { z } from "zod";
import { decisionSchema } from "@/lib/hr/attendance";
import { leaveLabels, leaveSchema } from "@/lib/hr/leave";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { adminUpdateLeave, decideLeave } from "@/lib/server/hr/leave";
import { hrAdminActor } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {approve, note}: Admin HR approves or refuses one request (not their own; the super admin may). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const role = await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const decision = validate(decisionSchema, await readJson(request, 1_000));
    const decided = await decideLeave(id, decision, await hrAdminActor(), new Date(), role === "super");
    return success(decided, `${leaveLabels[decided.type]} ${decision.approve ? "disetujui" : "ditolak"}.`);
  });
}

/** PUT {type, startDate, endDate, note}: Admin HR changes a waiting or approved one. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const changed = await adminUpdateLeave(id, validate(leaveSchema, await readJson(request, 2_000)), await hrAdminActor());
    return success(changed, `${leaveLabels[changed.type]} diubah.`);
  });
}
