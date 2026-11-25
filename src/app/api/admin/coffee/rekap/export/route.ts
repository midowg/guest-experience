import { z } from "zod";
import { recapQuerySchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { recapFiles } from "@/lib/server/coffee/recap";
import { handle, validate } from "@/lib/server/http";
import { sameOriginRead } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";

/** GET ?format=csv|xlsx and Rekap's filter: the same rows as a file (.csv: Detail; .xlsx: Detail and Ringkasan). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    sameOriginRead(request);
    const { format, ...filter } = Object.fromEntries(new URL(request.url).searchParams);
    const kind = validate(z.enum(["csv", "xlsx"], "Format berkas tidak dikenali. Pilih CSV atau Excel."), format);
    const query = validate(recapQuerySchema, filter);
    const files = await recapFiles(query);
    const name = `werkudara-coffee-${query.dari}_${query.sampai}.${kind}`;
    return new Response(kind === "csv" ? files.csv : new Uint8Array(files.xlsx), {
      headers: {
        "Content-Type": kind === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
