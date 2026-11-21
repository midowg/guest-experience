import { z } from "zod";
import { handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { adminDayTable, jakartaToday } from "@/lib/server/hr/leave";

export const dynamic = "force-dynamic";

/** GET ?tanggal=YYYY-MM-DD: everyone who should clock in, with their masuk and pulang that day and its coloured cell. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const date = validate(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid."), new URL(request.url).searchParams.get("tanggal"));
    return success(await adminDayTable(date, jakartaToday()), "");
  });
}
