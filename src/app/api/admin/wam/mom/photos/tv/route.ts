import { cabinetTvManySchema } from "@/lib/pra-wam/mom-cabinet";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { cabinetPhotosToTv, momCabinet } from "@/lib/server/pra-wam/mom-cabinet";

export const dynamic = "force-dynamic";

/** POST {photos: [{id, title}]}: Galeri → Masukkan ke TV (any admin): the chosen photos become pictures of the TV's playlist, in order. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { photos } = validate(cabinetTvManySchema, await readJson(request, 10_000));
    const { added, already, left } = await cabinetPhotosToTv(photos);
    const parts = [
      `${added} foto masuk ke daftar tayangan TV`,
      ...(already ? [`${already} sudah ada di TV`] : []),
      ...(left ? [`${left} tidak masuk karena TV sudah penuh (30 gambar); hapus gambar lama di TV Announcement dulu`] : []),
    ];
    return success(await momCabinet(), `${parts.join(", ")}.`);
  });
}
