import { wibDate } from "@/lib/pra-wam/appraisal";
import { managesSessions } from "@/lib/pra-wam/roles";
import { exportDates, exportDays, exportRows, exportText, rangeLabel } from "@/lib/pra-wam/schedule-export";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { sameOriginRead } from "@/lib/server/pra-wam/hr-lock";
import { schedulePdf } from "@/lib/server/pra-wam/schedule-pdf";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import { writeXlsx } from "@/lib/server/xlsx-write";

export const dynamic = "force-dynamic";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET ?format=pdf|xlsx|text&rentang=minggu|hari&tanggal=YYYY-MM-DD (panitia and admin, 10 Nov
 * 2026): Linimasa's published sessions of that week or day, as a file or as the WhatsApp text.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    if (!managesSessions(member)) throw new ServiceError(403, "Hanya panitia yang bisa mengekspor jadwal.");
    sameOriginRead(request);
    const query = new URL(request.url).searchParams;
    const format = query.get("format");
    if (format !== "pdf" && format !== "xlsx" && format !== "text") throw new ServiceError(400, "Format export tidak dikenal.");
    const now = new Date();
    const asked = query.get("tanggal");
    const date = asked && DATE.test(asked) ? asked : wibDate(now.toISOString());
    const range = query.get("rentang") === "hari" ? "hari" : "minggu";
    const dates = exportDates(range, date);
    const { sessions } = await listSessions(member);
    const days = exportDays(sessions, dates);
    const name = `jadwal-meeting-${dates[0]}${dates.length > 1 ? `-sd-${dates[dates.length - 1]}` : ""}`;
    const headers = (type: string, file: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" });
    if (format === "text") return new Response(exportText(days, now, dates), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    if (format === "xlsx") {
      const file = writeXlsx([{ name: "Jadwal meeting", rows: exportRows(days), widths: [22, 36, 28, 9, 9, 6, 22] }]);
      return new Response(new Uint8Array(file), { headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${name}.xlsx`) });
    }
    const pdf = await schedulePdf(days, rangeLabel(dates), now);
    return new Response(Buffer.from(pdf), { headers: headers("application/pdf", `${name}.pdf`) });
  });
}
