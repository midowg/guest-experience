import { wibDate } from "@/lib/pra-wam/appraisal";
import { managesSessions } from "@/lib/pra-wam/roles";
import { exportDates, exportDays, exportRows, exportText, fullSessions, fullSheets, queryDate, rangeLabel, type FullPerson } from "@/lib/pra-wam/schedule-export";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { listPeople } from "@/lib/server/pra-wam/appraisal";
import { sameOriginRead } from "@/lib/server/pra-wam/hr-lock";
import { schedulePdf } from "@/lib/server/pra-wam/schedule-pdf";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import { databaseError } from "@/lib/server/http";
import { createPrivilegedClient } from "@/lib/server/supabase/admin";
import { writeXlsx } from "@/lib/server/xlsx-write";

export const dynamic = "force-dynamic";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Who is in each of these sessions (read 100 sessions at a time). */
async function participantsOf(sessionIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const client = createPrivilegedClient();
  for (let start = 0; start < sessionIds.length; start += 100) {
    const { data, error } = await client.from("pw_session_participants").select("session_id,employee_id").in("session_id", sessionIds.slice(start, start + 100));
    if (error) databaseError(error);
    for (const row of data ?? []) out.set(row.session_id as string, [...(out.get(row.session_id as string) ?? []), row.employee_id as string]);
  }
  return out;
}

/**
 * GET ?format=pdf|xlsx|text&rentang=minggu|hari&tanggal=YYYY-MM-DD (panitia and admin, 10 Nov
 * 2026): Linimasa's published sessions of that week or day, as a file or as the WhatsApp text.
 * ?format=lengkap&dari=YYYY-MM-DD&sampai=YYYY-MM-DD (13 Nov 2026): every published meeting in the
 * range (either end left out: open), with everyone in it by full name and their departments.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    if (!managesSessions(member)) throw new ServiceError(403, "Hanya panitia yang bisa mengekspor jadwal.");
    sameOriginRead(request);
    const query = new URL(request.url).searchParams;
    const format = query.get("format");
    if (format !== "pdf" && format !== "xlsx" && format !== "text" && format !== "lengkap") throw new ServiceError(400, "Format export tidak dikenal.");
    const now = new Date();
    if (format === "lengkap") {
      const from = queryDate(query.get("dari")), to = queryDate(query.get("sampai"));
      if (from && to && from > to) throw new ServiceError(400, "Tanggal mulai harus sebelum tanggal akhir.");
      const meetings = fullSessions((await listSessions(member)).sessions, from, to);
      const [inThem, people] = await Promise.all([participantsOf(meetings.map(session => session.id)), listPeople()]);
      const byId = new Map(people.map(person => [person.id, { fullName: person.fullName ?? person.name, department: person.department ?? "" }]));
      const sheets = fullSheets(meetings, id => (inThem.get(id) ?? []).map(person => byId.get(person)).filter((person): person is FullPerson => !!person));
      const file = writeXlsx([
        { name: "Jadwal", rows: sheets.meetings, widths: [22, 8, 8, 24, 34, 9, 22, 22, 9, 70] },
        { name: "Peserta", rows: sheets.people, widths: [22, 8, 8, 24, 34, 30, 30] },
      ]);
      const name = `data-jadwal-meeting-${from ?? "awal"}-sd-${to ?? "akhir"}.xlsx`;
      return new Response(new Uint8Array(file), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store",
      } });
    }
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
