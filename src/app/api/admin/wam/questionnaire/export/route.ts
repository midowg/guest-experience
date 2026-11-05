import { adminReader } from "@/lib/pra-wam/recap";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { hrUnlocked, logHrExport, sameOriginRead } from "@/lib/server/pra-wam/hr-lock";
import { currentForm, questionnaireWaiting } from "@/lib/server/pra-wam/questionnaire";
import { exportWorkbook } from "@/lib/server/pra-wam/recap";

export const dynamic = "force-dynamic";

/**
 * GET ?bagian=<section key>: the questionnaire's answers as .xlsx (any admin), one sheet per
 * section. HR answers go in only while this browser has Data HR open, and then the export is logged
 * under the person who opened it before the file leaves; without the log, no file.
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    sameOriginRead(request);
    const form = await currentForm();
    if (!form) throw questionnaireWaiting();
    const raw = new URL(request.url).searchParams.get("bagian");
    if (raw !== null && !/^[A-Za-z0-9_-]{1,40}$/.test(raw)) throw new ServiceError(404, "Bagian ini tidak ada di kuesioner.");
    const only = raw || null;
    const unlock = await hrUnlocked();
    const open = !!unlock && unlock.formId === form.id;
    const now = new Date();
    const result = await exportWorkbook(form, adminReader(open), only, now);
    if (result.includesHr && unlock) await logHrExport(unlock, request);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
    const name = `${form.slug}-${only ? `bagian-${only.toLowerCase()}` : "semua"}${result.includesHr ? "-dengan-hr" : ""}-${day}.xlsx`;
    return new Response(new Uint8Array(result.file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
