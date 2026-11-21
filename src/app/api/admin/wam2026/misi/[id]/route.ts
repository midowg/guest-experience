import { z } from "zod";
import { missionSchema } from "@/lib/main-wam/misi/schema";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteMission, updateMission } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idOf = async ({ params }: Params) => validate(z.uuid("Misi tidak dikenali."), (await params).id);

/** PATCH: the whole mission as the form holds it. */
export async function PATCH(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(missionSchema, await readJson(request, 5_000));
    await updateMission(await idOf(context), input);
    return success(null, input.active ? "Misi tersimpan dan aktif." : "Misi tersimpan.");
  });
}

/** DELETE: a mission with no completion (otherwise it is only turned off). */
export async function DELETE(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await deleteMission(await idOf(context));
    return success(null, "Misi dihapus.");
  });
}
