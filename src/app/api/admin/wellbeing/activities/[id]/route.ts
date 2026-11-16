import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { reviewActivity, wellbeingActor } from "@/lib/server/wellbeing/admin";
import { reviewSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** PATCH: Oke, Ubah poin, Tolak, or Urungkan (the previous state sent back) for one activity. */
export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ServiceError(404, "Aktivitas tidak ditemukan.");
    const input = validate(reviewSchema, await readJson(request, 2_000));
    const message = input.status === "rejected" ? "Aktivitas ditolak." : input.status === "adjusted" ? "Poin diubah." : input.checked ? "Ditandai sudah diperiksa." : "Dikembalikan.";
    return success(await reviewActivity(id.data, input, await wellbeingActor()), message);
  });
}
