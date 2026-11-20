import { handle, success } from "@/lib/server/http";
import { listFaces } from "@/lib/server/hr/attendance";
import { requireApiHrAdmin } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";

/** GET: every reference face with its status (impor, siap, aktif, menunggu, ditolak). */
export async function GET() {
  return handle(async () => {
    await requireApiHrAdmin();
    return success(await listFaces(), "");
  });
}
