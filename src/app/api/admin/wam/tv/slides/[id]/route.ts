import { z } from "zod";
import { tvSlidePatchSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { deleteSlide, tvAdmin, updateSlide } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ id: z.uuid() });

/** PATCH {title?, seconds?, active?}: one picture's name, how long it stays, and whether TVs play it (any admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = validate(schema, await params);
    await updateSlide(id, validate(tvSlidePatchSchema, await readJson(request, 2_000)));
    return success(await tvAdmin(), "Gambar diperbarui.");
  });
}

/** DELETE: the picture leaves the loop and storage (any admin). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = validate(schema, await params);
    await deleteSlide(id);
    return success(await tvAdmin(), "Gambar dihapus.");
  });
}
