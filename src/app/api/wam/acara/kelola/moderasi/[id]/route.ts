import { moderateSchema } from "@/lib/main-wam/panitia/schemas";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { apiOnlyFor, limitPerPerson } from "@/lib/server/main-wam/panitia/common";
import { moderatePhoto } from "@/lib/server/main-wam/panitia/moderation";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {action: "sembunyikan" | "tampilkan" | "hapus", from, reason?, note?}: a panitia's decision on a photo, and why (optional). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const context = apiOnlyFor(await requireMainWamApi(), "kelola");
    checkOrigin(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceError(404, "Foto ini sudah tidak ada.");
    await limitPerPerson("moderasi", context.viewer.id, 120);
    const input = validate(moderateSchema, await readJson(request, 2_000));
    await moderatePhoto(context, id, input);
    return success({ id, action: input.action }, input.action === "tampilkan" ? "Foto tampil lagi." : input.action === "hapus" ? "Foto dihapus." : "Foto disembunyikan.");
  });
}
