import { z } from "zod";
import { ROOM_LIMITS } from "@/lib/pra-wam/stay";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireHrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { deleteRoom, updateRoom } from "@/lib/server/pra-wam/stay";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ roomId: string }> };
const schema = z.object({
  name: z.string().trim().min(1, "Isi nama kamar.").max(ROOM_LIMITS.name, `Nama kamar paling panjang ${ROOM_LIMITS.name} karakter.`).optional(),
  kind: z.string().trim().max(ROOM_LIMITS.kind, `Jenis kamar paling panjang ${ROOM_LIMITS.kind} karakter.`).optional(),
  capacity: z.number({ message: "Isi kapasitas dengan angka." }).int("Kapasitas harus bilangan bulat.").min(1, "Kapasitas minimal 1.").max(ROOM_LIMITS.capacity, `Kapasitas paling banyak ${ROOM_LIMITS.capacity}.`).optional(),
  reviewed: z.boolean().optional(),
}).strict();

/** PATCH: one room's name, kind, capacity or "sudah ditinjau". Admin + Data HR open. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const roomId = validate(z.uuid(), (await params).roomId);
    const unlock = await requireHrUnlocked();
    await updateRoom(unlock, roomId, validate(schema, await readJson(request, 2_000)));
    return success(null, "Kamar disimpan.");
  });
}

/** DELETE: removes a room; its people go back to waiting. Admin + Data HR open. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const roomId = validate(z.uuid(), (await params).roomId);
    const unlock = await requireHrUnlocked();
    await deleteRoom(unlock, roomId);
    return success(null, "Kamar dihapus.");
  });
}
