import { z } from "zod";
import { handle, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { detectionOfPhoto } from "@/lib/server/main-wam/misi/deteksi";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * GET: what mission detection did for one photo of mine ({pending, items}), for the toast after sending. `pending` is true
 * while the server is still looking (it waits for the photo to show to others first). Only the owner; never a position.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    const id = validate(z.uuid("Foto tidak dikenali."), (await params).id);
    return success(await detectionOfPhoto(context, id), "");
  });
}
