import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { removeMyTag } from "@/lib/server/main-wam/misi/tags";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ photoId: string }> };

/** DELETE: lift my own tag off a mission photo (only the tagged person can; nobody else's tag is touched). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    await removeMyTag(context, validate(z.uuid("Foto tidak dikenali."), (await params).photoId));
    return success(null, "Tag dilepas.");
  });
}
