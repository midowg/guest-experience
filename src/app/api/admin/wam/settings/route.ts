import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";
import { setFloorPlan } from "@/lib/server/pra-wam/rooms";

export const dynamic = "force-dynamic";
const schema = z.object({ floorPlan: z.boolean() });

/** PUT: whether Book shows the office floor plan next to the calendar (super admin). */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const { floorPlan } = validate(schema, await readJson(request, 1_000));
    const settings = await setFloorPlan(floorPlan);
    return success(settings, settings.floorPlan ? "Denah tampil di Book." : "Denah disembunyikan. Book hanya menampilkan kalender.");
  });
}
