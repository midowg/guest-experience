import { z } from "zod";
import { photoConfirmSchema } from "@/lib/main-wam/misi/schema";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { confirmPhoto } from "@/lib/server/main-wam/misi/actions";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {…the same as unggah, token}: the two files are in storage; check the position and their bytes, then keep the proof. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    const id = validate(z.uuid("Misi tidak dikenali."), (await params).id);
    const input = validate(photoConfirmSchema, await readJson(request, 3_000));
    const completion = await confirmPhoto(context, id, input);
    return success({ status: completion.status }, completion.status === "disetujui" ? "Misi selesai." : "Foto terkirim. Menunggu persetujuan.");
  });
}
