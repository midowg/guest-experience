import { isId, roomDetailSchema } from "@/lib/main-wam/admin/requests";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveRoomDetail } from "@/lib/server/main-wam/admin/rooms";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ roomId: string }> };

/** PUT {floor, note}: what the handbook shows of a room of HR's pairing besides its people. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { roomId } = await params;
    if (!isId(roomId)) throw new ServiceError(404, "Kamar tidak ditemukan.");
    const input = validate(roomDetailSchema, await readJson(request, 2_000));
    return success(await saveRoomDetail(roomId, input), "Kamar tersimpan.");
  });
}
