import { photoConfirmSchema } from "@/lib/main-wam/momen/filters";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { confirmUpload } from "@/lib/server/main-wam/momen/upload";

export const dynamic = "force-dynamic";

/** POST {…the same as unggah, token}: the three files are in storage; check their bytes and keep the photo. */
export async function POST(request: Request) {
  return handle(async () => {
    const context = await requireActionApi("foto");
    checkOrigin(request);
    const input = validate(photoConfirmSchema, await readJson(request, 2_000));
    return success(await confirmUpload(context, input), "Terkirim.");
  });
}
