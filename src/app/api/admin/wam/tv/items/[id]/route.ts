import { z } from "zod";
import { tvItemPatchSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { deleteItem, tvAdmin, updateItem } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ id: z.uuid() });

/** PATCH: a row's text, duration, on/off, the days and hours it shows, and the TVs it plays on (any admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = validate(schema, await params);
    await updateItem(id, validate(tvItemPatchSchema, await readJson(request, 4_000)));
    return success(await tvAdmin(), "Tayangan diperbarui. TV mengikuti dalam seperempat menit.");
  });
}

/** DELETE: the row leaves the playlist; a picture's row takes its picture with it (any admin). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = validate(schema, await params);
    await deleteItem(id);
    return success(await tvAdmin(), "Tayangan dihapus.");
  });
}
