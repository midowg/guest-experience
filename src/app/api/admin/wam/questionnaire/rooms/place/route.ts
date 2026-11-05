import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireHrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { placePerson } from "@/lib/server/pra-wam/stay";

export const dynamic = "force-dynamic";
const schema = z.object({ employeeId: z.uuid("Pilih orang dari daftar."), roomId: z.uuid("Pilih kamar dari daftar.").nullable() });

/** PUT {employeeId, roomId}: puts one person in a room, or back to waiting (roomId null). Admin + Data HR open. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const unlock = await requireHrUnlocked();
    const { employeeId, roomId } = validate(schema, await readJson(request, 1_000));
    await placePerson(unlock, employeeId, roomId);
    return success(null, roomId ? "Dipindahkan." : "Dikeluarkan dari kamar.");
  });
}
