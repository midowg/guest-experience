import { z } from "zod";
import { handle, success, validate } from "@/lib/server/http";
import { adminDay } from "@/lib/server/hr/attendance";
import { requireApiHrAdmin } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";

/** GET ?tanggal=YYYY-MM-DD: everyone who should clock in, with their masuk and pulang that day. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiHrAdmin();
    const date = validate(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid."), new URL(request.url).searchParams.get("tanggal"));
    return success(await adminDay(date), "");
  });
}
