import { checkOrigin, handle, success } from "@/lib/server/http";
import { deleteOldSelfies } from "@/lib/server/hr/attendance";
import { requireApiHrAdmin } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";

/** POST: Admin HR deletes the selfies (and their embeddings) older than 90 days. No schedule runs it. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiHrAdmin();
    checkOrigin(request);
    const deleted = await deleteOldSelfies();
    return success({ deleted }, deleted ? `${deleted} selfie lebih dari 90 hari dihapus.` : "Tidak ada selfie yang lebih dari 90 hari.");
  });
}
