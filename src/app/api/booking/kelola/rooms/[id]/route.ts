import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveOfficeRoom } from "@/lib/server/booking/admin";
import { requireFacilityManager } from "@/lib/server/booking/bookings";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH: Kelola saves one room's name, capacity, facilities, departments and bookable (administration staff only). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    requireFacilityManager(member);
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const patch = validate(z.object({
      name: z.string().trim().min(2, "Nama ruangan 2 sampai 60 karakter.").max(60, "Nama ruangan 2 sampai 60 karakter."),
      capacity: z.number().int().min(1, "Kapasitas 1 sampai 500 orang.").max(500, "Kapasitas 1 sampai 500 orang.").nullable(),
      bookable: z.boolean(),
      facilities: z.array(z.string().trim().min(1).max(40)).max(20),
      departments: z.array(z.string().trim().min(1).max(80)).max(30),
    }), await readJson(request, 10_000));
    await saveOfficeRoom(id, patch);
    return success(null, `${patch.name} disimpan.`);
  });
}
