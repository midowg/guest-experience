import { z } from "zod";
import { leaveLabels } from "@/lib/hr/leave";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { withdrawLeave } from "@/lib/server/hr/leave";
import { hrAdminActor } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {note}: Admin HR withdraws a waiting or approved request (plans changed); its days leave the calendar. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const { note } = validate(z.object({ note: z.string().trim().max(250).default("") }), await readJson(request, 1_000));
    const withdrawn = await withdrawLeave(id, note, await hrAdminActor());
    return success(withdrawn, `${leaveLabels[withdrawn.type]} dibatalkan; tanggalnya keluar dari kalender.`);
  });
}
