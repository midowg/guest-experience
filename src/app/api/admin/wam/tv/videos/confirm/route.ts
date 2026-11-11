import { tvVideoConfirmSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { confirmVideoUpload, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** POST {mime, size, key, token, title}: the video file is in storage; check it and add it to the playlist, last (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await confirmVideoUpload(validate(tvVideoConfirmSchema, await readJson(request, 4_000)));
    return success(await tvAdmin(), "Video ditambahkan di urutan terakhir.");
  });
}
