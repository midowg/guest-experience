import { z } from "zod";
import { carbonSetupSchema } from "@/lib/pra-wam/carbon";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { carbonAdminState, saveCarbonSetup, sendToGroup } from "@/lib/server/pra-wam/carbon";

export const dynamic = "force-dynamic";

/** PUT: the panitia's setup for Jejak karbon (any admin): the group trip, nights, meals, form open. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await saveCarbonSetup(validate(carbonSetupSchema, await readJson(request, 10_000)));
    return success(await carbonAdminState(), "Jejak karbon disimpan.");
  });
}

/** POST {id}: send a participant back to the group trip (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = validate(z.object({ id: z.string().trim().min(1).max(200) }), await readJson(request, 2_000));
    await sendToGroup(id);
    return success(await carbonAdminState(), "Peserta kembali ikut rombongan.");
  });
}
