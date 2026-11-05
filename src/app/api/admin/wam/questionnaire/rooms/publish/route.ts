import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireHrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { publishRooms } from "@/lib/server/pra-wam/stay";

export const dynamic = "force-dynamic";
const schema = z.object({ published: z.boolean() });

/** PUT {published}: shows the pairing to participants on Beranda, or takes it back. Admin + Data HR open. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const unlock = await requireHrUnlocked();
    const { published } = validate(schema, await readJson(request, 200));
    const at = await publishRooms(unlock, published);
    return success({ publishedAt: at }, published ? "Kamar terbit: peserta melihat kamarnya di Beranda." : "Kamar ditarik dari Beranda peserta.");
  });
}
