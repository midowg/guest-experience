import { handle, success } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { loadLeaderboard } from "@/lib/server/main-wam/misi/read";

export const dynamic = "force-dynamic";

/**
 * GET: the Peringkat: rank, nama panggilan, department's short form and points per person, and which
 * row is the asker's. No ids. Closed (`open: false`, no rows) while Admin WAM has not opened it.
 */
export async function GET() {
  return handle(async () => {
    const context = await requireActionApi("misi");
    return success(await loadLeaderboard(context), "");
  });
}
