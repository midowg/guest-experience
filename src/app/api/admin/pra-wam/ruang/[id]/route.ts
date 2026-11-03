import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";
import { updateRoom } from "@/lib/server/pra-wam/accounts";
import { listRooms } from "@/lib/server/pra-wam/appraisal";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ capacity: z.number().int().min(1, "Kapasitas minimal 1.").max(500).nullable(), bookable: z.boolean() });

/** PATCH: a room's capacity and whether appraisal may book it (super admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    await updateRoom(id, validate(schema, await readJson(request, 2_000)));
    return success(await listRooms(), "Ruang disimpan.");
  });
}
