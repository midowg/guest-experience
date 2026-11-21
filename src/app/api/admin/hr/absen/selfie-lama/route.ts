import { checkOrigin, handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { deleteOldSelfies } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";

/** POST: deletes the selfies (and their embeddings) older than 90 days. No schedule runs it. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const deleted = await deleteOldSelfies();
    return success({ deleted }, deleted ? `${deleted} selfie lebih dari 90 hari dihapus.` : "Tidak ada selfie yang lebih dari 90 hari.");
  });
}
