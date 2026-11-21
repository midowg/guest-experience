import { isMonth } from "@/lib/hr/leave";
import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { adminMonth, jakartaToday } from "@/lib/server/hr/leave";

export const dynamic = "force-dynamic";

/** GET ?bulan=YYYY-MM: Rekap bulanan, everyone × every day of the month as coloured cells. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const month = new URL(request.url).searchParams.get("bulan");
    if (!isMonth(month)) throw new ServiceError(422, "Bulan tidak dikenali.");
    return success(await adminMonth(month, jakartaToday()), "");
  });
}
