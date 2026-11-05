import { z } from "zod";
import { parseRoomLines } from "@/lib/pra-wam/stay";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireHrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { addRooms } from "@/lib/server/pra-wam/stay";

export const dynamic = "force-dynamic";
const schema = z.object({ text: z.string().max(20_000, "Daftar kamar terlalu panjang.") });

/** POST {text}: adds the hotel's rooms, one per line ("208, Twin bed, 2"). Admin + Data HR open. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const unlock = await requireHrUnlocked();
    const { text } = validate(schema, await readJson(request, 40_000));
    const { rooms, problems } = parseRoomLines(text);
    if (problems.length) throw new ServiceError(422, problems[0], { text: problems });
    if (!rooms.length) throw new ServiceError(422, "Tulis minimal satu kamar.", { text: ["Tulis minimal satu kamar."] });
    const added = await addRooms(unlock, rooms);
    return success({ added }, `${added} kamar ditambahkan.`);
  });
}
