import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { createRoom } from "@/lib/server/pra-wam/rooms";

export const dynamic = "force-dynamic";
const schema = z.object({
  name: z.string().trim().min(2, "Nama ruang minimal 2 karakter.").max(60, "Nama ruang paling banyak 60 karakter."),
  kind: z.enum(["utama", "area"]),
});

/**
 * POST: adds a room (any admin, 10 Nov 2026), so admins and panitia no longer need a developer for
 * it. It starts not bookable; the answer names its id, for its editor to open on it.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(schema, await readJson(request, 1_000));
    const id = await createRoom(input);
    return success({ id, rooms: await listRooms() }, `${input.name} ditambahkan. Atur kapasitas, spot, dan siapa yang boleh memakainya, lalu nyalakan Bisa dibooking.`);
  });
}
