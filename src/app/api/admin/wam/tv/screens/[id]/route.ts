import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { deleteScreen, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ id: z.uuid() });

/** DELETE: the TV is removed and its address stops working at once (any admin). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = validate(schema, await params);
    await deleteScreen(id);
    return success(await tvAdmin(), "TV dihapus. Tautannya sudah tidak berlaku.");
  });
}
