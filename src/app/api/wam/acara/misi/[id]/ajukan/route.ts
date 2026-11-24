import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { dismissSuggestion, submitSuggestion } from "@/lib/server/main-wam/misi/deteksi";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const body = z.object({ photoId: z.uuid("Foto tidak dikenali.") }).strict();

/**
 * POST {photoId}: "Ajukan": send one of my Momen photos for this mission (a suggestion I accept; it works with my
 * switch off). The photo is not uploaded again. 409 with the reason when the photo does not meet the mission.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    const id = validate(z.uuid("Misi tidak dikenali."), (await params).id);
    const { photoId } = validate(body, await readJson(request, 300));
    const result = await submitSuggestion(context, id, photoId);
    return success({ status: result.completionStatus }, result.completionStatus === "disetujui" ? "Misi selesai." : "Fotomu diajukan. Panitia akan meninjau.");
  });
}

/** DELETE {photoId}: "Abaikan": this photo is not offered again for this mission. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    const id = validate(z.uuid("Misi tidak dikenali."), (await params).id);
    const { photoId } = validate(body, await readJson(request, 300));
    await dismissSuggestion(context, id, photoId);
    return success(null, "Saran diabaikan.");
  });
}
