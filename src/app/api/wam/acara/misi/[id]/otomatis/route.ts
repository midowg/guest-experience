import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { takeBack } from "@/lib/server/main-wam/misi/deteksi";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** DELETE: "Tarik": take back the proof that was made from a Momen photo while nobody has decided (409 after). The photo stays. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    await takeBack(context, validate(z.uuid("Misi tidak dikenali."), (await params).id));
    return success(null, "Pengajuan ditarik.");
  });
}
