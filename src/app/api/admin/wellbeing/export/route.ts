import { checkOrigin, enforceRateLimit, handle, readJson, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { wellbeingActor } from "@/lib/server/wellbeing/admin";
import { exportSchema, exportWorkbook } from "@/lib/server/wellbeing/export";

export const dynamic = "force-dynamic";

/**
 * POST: Laporan → Unduh Excel (.xlsx). The choice comes as JSON (the data, the period, the filters,
 * or the activities ticked in Periksa); the answer is the file itself, or the usual JSON error.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await enforceRateLimit(request, "wellbeing-export", 30);
    const input = validate(exportSchema, await readJson(request, 24_000));
    const { file, name } = await exportWorkbook(input, await wellbeingActor());
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
