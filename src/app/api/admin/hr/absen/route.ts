import { z } from "zod";
import { handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { adminDay } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";

/** GET ?tanggal=YYYY-MM-DD: everyone who should clock in, with their masuk and pulang that day. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const date = validate(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid."), new URL(request.url).searchParams.get("tanggal"));
    return success(await adminDay(date), "");
  });
}
