import { cabinetExportSchema } from "@/lib/pra-wam/mom-cabinet";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, validate } from "@/lib/server/http";
import { cabinetWorkbook } from "@/lib/server/pra-wam/mom-cabinet";

export const dynamic = "force-dynamic";

/** POST {ids}: Excel rekap of these MoMs (any admin): MoM, agenda items, and action items. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { ids } = validate(cabinetExportSchema, await readJson(request, 60_000));
    const file = await cabinetWorkbook(ids);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rekap-mom-${day}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
