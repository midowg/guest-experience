import { tvTakeoverSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { startTakeover, stopTakeover, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** POST {itemId, minutes, screenIds}: Tayangkan sekarang. One row takes the TVs over, for some minutes or until stopped (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await startTakeover(validate(tvTakeoverSchema, await readJson(request, 4_000)));
    return success(await tvAdmin(), "Tayangan ini mengambil alih TV. TV yang menyala beralih dalam sepuluh detik.");
  });
}

/** DELETE: Hentikan. The TVs go back to the playlist (any admin). */
export async function DELETE(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await stopTakeover();
    return success(await tvAdmin(), "Dihentikan. TV kembali ke daftar tayangan dalam sepuluh detik.");
  });
}
