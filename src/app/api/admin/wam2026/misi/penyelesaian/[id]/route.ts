import { z } from "zod";
import { reviewSchema } from "@/lib/main-wam/misi/schema";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteCompletion, reviewCompletion } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const idOf = async ({ params }: Params) => validate(z.uuid("Penyelesaian tidak dikenali."), (await params).id);

/** PATCH {status: "disetujui" | "ditolak", note}: approve a proof, or reject it (a rejected one takes its points back and may be sent again). */
export async function PATCH(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(reviewSchema, await readJson(request, 1_000));
    await reviewCompletion(await idOf(context), input);
    return success(null, input.status === "disetujui" ? "Disetujui. Poin masuk." : "Ditolak. Poin dikembalikan; peserta bisa kirim ulang.");
  });
}

/** DELETE: take the completion back entirely (its points and its photo go). */
export async function DELETE(request: Request, context: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await deleteCompletion(await idOf(context));
    return success(null, "Penyelesaian dihapus.");
  });
}
