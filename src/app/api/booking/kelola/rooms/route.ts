import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { createOfficeRoom } from "@/lib/server/booking/admin";
import { requireFacilityManager } from "@/lib/server/booking/bookings";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST {name, capacity}: Kelola adds a room, bookable at once (administration staff only). */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    requireFacilityManager(member);
    checkOrigin(request);
    const { name, capacity } = validate(z.object({
      name: z.string().trim().min(2, "Nama ruangan 2 sampai 60 karakter.").max(60, "Nama ruangan 2 sampai 60 karakter."),
      capacity: z.number().int().min(1, "Kapasitas 1 sampai 500 orang.").max(500, "Kapasitas 1 sampai 500 orang.").nullable().default(null),
    }), await readJson(request, 2_000));
    return success({ id: await createOfficeRoom(name, capacity) }, `${name} ditambahkan.`);
  });
}
