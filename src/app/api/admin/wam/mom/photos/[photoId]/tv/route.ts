import { z } from "zod";
import { cabinetTvSchema } from "@/lib/pra-wam/mom-cabinet";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { cabinetPhotoToTv, momCabinet } from "@/lib/server/pra-wam/mom-cabinet";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ photoId: string }> };

/** POST {title}: Tampilkan di TV (any admin): the photo becomes a picture of the TV's playlist, last and shown. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).photoId);
    const { title } = validate(cabinetTvSchema, await readJson(request, 2_000));
    await cabinetPhotoToTv(id, title);
    return success(await momCabinet(), "Foto masuk ke TV Announcement, paling akhir di daftar tayangan. Atur durasi dan layarnya di sana.");
  });
}
