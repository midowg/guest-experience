import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle } from "@/lib/server/http";
import { answerTable, tableSheet } from "@/lib/server/pra-wam/answer-table";
import { foodSheets } from "@/lib/server/pra-wam/food-export";
import { currentForm, formContent, questionnaireWaiting } from "@/lib/server/pra-wam/questionnaire";
import { hrUnlocked, logHrExport, sameOriginRead } from "@/lib/server/pra-wam/hr-lock";
import { writeXlsx } from "@/lib/server/xlsx-write";

export const dynamic = "force-dynamic";

/**
 * GET: Rekap's table as .xlsx (any admin, 11 Nov 2026): a row per person, a column per question, HR
 * answers included. Logged as an export first. ?isi=makanan: only the food answers (19 Nov 2026).
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    sameOriginRead(request);
    const form = await currentForm();
    if (!form) throw questionnaireWaiting();
    const table = await answerTable(form);
    if (!table) throw questionnaireWaiting();
    const unlock = await hrUnlocked();
    if (unlock) await logHrExport(unlock, request).catch(() => undefined);
    // ?isi=makanan (19 Nov 2026): only the food answers, for the catering, with a summary.
    const food = new URL(request.url).searchParams.get("isi") === "makanan";
    const file = food
      ? writeXlsx(foodSheets(table, (await formContent(form.id)).questions).sheets)
      : writeXlsx([{ name: "Rekap", rows: tableSheet(table), widths: [28, 22, 16, ...table.columns.map(() => 32)] }]);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${form.slug}-${food ? "makanan" : "rekap"}-${day}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
