import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { markMainWamRead } from "@/lib/server/main-wam/notes";
import { limitPerson } from "@/lib/server/main-wam/peserta/limit";
import { loadNotifications } from "@/lib/server/main-wam/peserta/saya";

export const dynamic = "force-dynamic";
const markSchema = z.object({ id: z.uuid("Notifikasi tidak dikenal.").optional() }).strict();

/** GET: the person's notifications (Main WAM's and Pra WAM's), grouped Hari ini / Sebelumnya. */
export async function GET() {
  return handle(async () => {
    const context = await requireMainWamApi();
    return success(await loadNotifications(context, new Date()), "Notifikasi dimuat.");
  });
}

/** POST {id?}: mark one of the person's own notifications read, or all of them. */
export async function POST(request: Request) {
  return handle(async () => {
    const { viewer } = await requireMainWamApi();
    checkOrigin(request);
    const { id } = validate(markSchema, await readJson(request, 1_000));
    await limitPerson("notifikasi-dibaca", viewer.id, 60);
    await markMainWamRead(viewer.id, id);
    return success(null, id ? "Ditandai dibaca." : "Semua ditandai dibaca.");
  });
}
