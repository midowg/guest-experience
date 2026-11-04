import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { saveRoom } from "@/lib/server/pra-wam/rooms";
import { FACILITY_LIMITS } from "@/lib/pra-wam/floor-plan";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const people = (label: string) => z.number().int(`${label} harus bilangan bulat.`).min(1, `${label} minimal 1.`).max(500, `${label} paling banyak 500.`).nullable();
const schema = z.object({
  capacity: people("Kapasitas"),
  minPeople: people("Minimal orang"),
  bookable: z.boolean(),
  planKey: z.string().regex(/^[a-z0-9-]{2,40}$/, "Pilih spot dari denah.").nullable(),
  /** Facility tags; spaces collapsed, repeats (any case) dropped. Left as they are when absent. */
  facilities: z.array(z.string().transform(tag => tag.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(FACILITY_LIMITS.min, `Setiap fasilitas minimal ${FACILITY_LIMITS.min} karakter.`).max(FACILITY_LIMITS.max, `Setiap fasilitas paling banyak ${FACILITY_LIMITS.max} karakter.`).regex(/^[^,]+$/, "Pisahkan fasilitas dengan koma.")))
    .max(FACILITY_LIMITS.count, `Paling banyak ${FACILITY_LIMITS.count} fasilitas.`)
    .transform(tags => tags.filter((tag, index) => tags.findIndex(other => other.toLowerCase() === tag.toLowerCase()) === index))
    .optional(),
  /** Take the spot from the room that has it. */
  replace: z.boolean().optional(),
}).refine(patch => patch.capacity == null || patch.minPeople == null || patch.minPeople <= patch.capacity, {
  path: ["minPeople"], message: "Minimal orang tidak boleh lebih dari kapasitas.",
});

/** PATCH: a room's capacity, fewest people, facilities, bookable and floor plan spot (super admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const { replace, ...patch } = validate(schema, await readJson(request, 2_000));
    await saveRoom(id, patch, { replace });
    return success(await listRooms(), "Ruang disimpan.");
  });
}
