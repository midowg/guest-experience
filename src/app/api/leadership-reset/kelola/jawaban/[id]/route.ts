import { z } from "zod";
import { LEADERSHIP_RESET_KEY_HEADER } from "@/lib/routes";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { deleteResponse } from "@/lib/server/leadership-reset";

export const dynamic = "force-dynamic";

/** DELETE (CMS key in the header): remove one answer (a test, or a leader who filled twice). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    return success(await deleteResponse(request.headers.get(LEADERSHIP_RESET_KEY_HEADER), id), "Jawaban dihapus.");
  });
}
