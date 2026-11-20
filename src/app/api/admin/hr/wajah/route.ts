import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { listFaces } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";

/** GET: every reference face with its status (impor, siap, aktif, menunggu, ditolak). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await listFaces(), "");
  });
}
