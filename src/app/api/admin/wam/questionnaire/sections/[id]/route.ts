import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { removeSection, sectionPatchSchema, updateSection } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH: a section's texts, anonymity or hidden flag (any admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    return success(await updateSection(id, validate(sectionPatchSchema, await readJson(request, 10_000))), "Bagian disimpan.");
  });
}

/** DELETE: removes a section and its questions, or hides it once it has answers (any admin). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { result, hidden } = await removeSection(validate(z.uuid(), (await params).id));
    return success(result, hidden ? "Bagian ini sudah punya jawaban, jadi disembunyikan, tidak dihapus." : "Bagian dihapus.");
  });
}
