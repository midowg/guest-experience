import { handle, success } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { silentRecap } from "@/lib/server/main-wam/modul/silent";

export const dynamic = "force-dynamic";

/** GET: the anonymous recap for the BOD (B05): shuffled, without time, only once closed and from 5 feedbacks of 5 people. */
export async function GET() {
  return handle(async () => {
    await requireActionApi("silent-rekap");
    return success(await silentRecap(new Date()), "");
  });
}
