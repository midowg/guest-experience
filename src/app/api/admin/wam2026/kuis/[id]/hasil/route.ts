import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, success, validate } from "@/lib/server/http";
import { resultsXlsx, runResults } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const query = z.object({ permainan: z.uuid("Permainan tidak dikenali."), unduh: z.literal("1").optional() });

/** GET ?permainan=: a game's results with names (for the prizes); `unduh=1` = the Excel file. */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const id = validate(z.uuid("Kuis tidak dikenali."), (await params).id);
    const { permainan, unduh } = validate(query, Object.fromEntries(new URL(request.url).searchParams));
    if (!unduh) return success(await runResults(id, permainan), "");
    const { file, name } = await resultsXlsx(id, permainan);
    return new NextResponse(new Uint8Array(file), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store",
    } });
  });
}
