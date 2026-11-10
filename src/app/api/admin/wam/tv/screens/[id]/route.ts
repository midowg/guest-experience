import { z } from "zod";
import { tvScreenPatchSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { deleteScreen, tvAdmin, updateScreen } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ id: z.uuid() });

/** PATCH {name?, slug?}: a TV's name or address (any admin). A new address takes over at once; the old one stops working. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = validate(schema, await params);
    const change = validate(tvScreenPatchSchema, await readJson(request, 2_000));
    await updateScreen(id, change);
    return success(await tvAdmin(), change.slug ? "Alamat TV diganti. Buka alamat baru di TV-nya; alamat lama sudah tidak berlaku." : "TV diperbarui.");
  });
}

/** DELETE: the TV is removed and its address stops working at once (any admin). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = validate(schema, await params);
    await deleteScreen(id);
    return success(await tvAdmin(), "TV dihapus. Alamatnya sudah tidak berlaku.");
  });
}
