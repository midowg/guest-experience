import { z } from "zod";
import { photoStartSchema } from "@/lib/main-wam/misi/schema";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { startPhoto } from "@/lib/server/main-wam/misi/actions";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {clientId, position, size, thumbSize, tileSize, width, height, tags}: three upload addresses (besar, kecil, ubin) and a token, once the position passes. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    const id = validate(z.uuid("Misi tidak dikenali."), (await params).id);
    const input = validate(photoStartSchema, await readJson(request, 3_000));
    return success(await startPhoto(context, id, input), "Siap mengirim.");
  });
}
