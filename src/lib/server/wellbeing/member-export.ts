import "server-only";
import { z } from "zod";
import { DIMENSIONS, dimensionLabels, wibToday, type DimensionId } from "@/lib/wellbeing/rules";
import type { WbActivity } from "@/lib/wellbeing/types";
import { databaseError } from "../http";
import type { Member } from "../pra-wam/session";
import { writeXlsx, type Cell, type SheetOut } from "../xlsx-write";
import { ACTIVITY_COLUMNS, toActivity } from "./admin";
import { EXPORT_PERIODS, periodOf } from "./export";
import { db, missing, readAll, readTotals, waiting, withTime, withTimeColumn } from "./shared";

/*
 * Unduh rekap saya (19 Nov 2026): an employee downloads their own WLM data as Excel, to keep their own
 * recap. Only their own rows, for a period (this month, last month, a range, or all of it): Ringkasan
 * (the points as the app counts them, per dimension), Aktivitas (every activity, with its status and the
 * admin's reason), and Poin dari admin (the ones that count). Nothing about anyone else, and not who
 * checked it in the admin.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const myExportSchema = z.object({
  period: z.enum(EXPORT_PERIODS).default("month"),
  from: z.string().regex(DAY, "Tanggal mulai tidak valid.").nullish(),
  to: z.string().regex(DAY, "Tanggal akhir tidak valid.").nullish(),
}).superRefine((value, ctx) => {
  if (value.period === "range" && (!value.from || !value.to)) ctx.addIssue({ code: "custom", path: ["from"], message: "Isi tanggal mulai dan akhir." });
  if (value.from && value.to && value.from > value.to) ctx.addIssue({ code: "custom", path: ["to"], message: "Tanggal akhir sebelum tanggal mulai." });
});
export type MyExportInput = z.infer<typeof myExportSchema>;

type Range = { from: string | null; to: string | null };
const sourceLabels: Record<WbActivity["source"], string> = { manual: "Dicatat sendiri", strava: "Strava", import: "Aplikasi lama" };
export const myStatusOf = (item: Pick<WbActivity, "status">) => item.status === "rejected" ? "Ditolak" : item.status === "adjusted" ? "Diubah admin" : "Dihitung";
const longDay = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const wibStamp = (at: string | Date) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  .format(typeof at === "string" ? new Date(at) : at).replace(",", "");
const periodText = (range: Range) => range.from && range.to ? `${longDay(range.from)} – ${longDay(range.to)}` : "Sepanjang program";
/** "dewi", "raja-damai": the file name's part for the person (letters and digits only). */
export const fileSlug = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "saya";

/** My activities in the period, oldest first. */
async function myActivities(member: Member, range: Range): Promise<WbActivity[]> {
  const { rows, error } = await readAll((start, end) => withTimeColumn(on => {
    let request = db().from("wb_activities").select(withTime(ACTIVITY_COLUMNS, on)).eq("employee_id", member.id)
      .order("happened_on", { ascending: true }).order("created_at", { ascending: true }).order("id");
    if (range.from) request = request.gte("happened_on", range.from);
    if (range.to) request = request.lte("happened_on", range.to);
    return request.range(start, end);
  }), 60);
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  return rows.map(toActivity);
}

/** My points from the admin in the period that count (not cancelled), oldest first. */
async function myPointEntries(member: Member, range: Range) {
  const { rows, error } = await readAll((start, end) => {
    let request = db().from("wb_point_entries").select("id,points,dimension_id,reason,happened_on,kind").eq("employee_id", member.id).is("voided_at", null)
      .order("happened_on", { ascending: true }).order("created_at").order("id");
    if (range.from) request = request.gte("happened_on", range.from);
    if (range.to) request = request.lte("happened_on", range.to);
    return request.range(start, end);
  }, 60);
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  return rows;
}

/** POST /api/wellbeing/export: my recap as an Excel file. */
export async function myExportWorkbook(member: Member, input: MyExportInput, now = new Date()): Promise<{ file: Buffer; name: string }> {
  const today = wibToday(now);
  const range = periodOf(input, today);
  const [activities, entries, totals] = await Promise.all([myActivities(member, range), myPointEntries(member, range), readTotals(range.from, range.to)]);
  if (!totals.migrated) throw waiting();
  // The points as the app counts them (the same sums as Beranda and Peringkat).
  const dims: Record<DimensionId, number> = { physical: 0, emotional: 0, social: 0, financial: 0, spiritual: 0 };
  let total = 0, other = 0;
  for (const row of totals.rows) if (row.employee_id === member.id) {
    total += row.points;
    if (row.dimension_id) dims[row.dimension_id] += row.points; else other += row.points;
  }
  const counted = activities.filter(item => item.status !== "rejected");
  const summary: SheetOut = { name: "Ringkasan", widths: [30, 44], rows: [
    ["Rekap WLM", member.name],
    ["Divisi", member.department || "-"],
    ["Periode", periodText(range)],
    ["Total poin", total],
    ...DIMENSIONS.map((dimension): Cell[] => [`Poin ${dimensionLabels[dimension]}`, dims[dimension]]),
    ...(other ? [["Poin lain (dari admin)", other] as Cell[]] : []),
    ["Aktivitas dihitung", counted.length],
    ["Aktivitas ditolak", activities.length - counted.length],
    ["Hari aktif", new Set(counted.map(item => item.date)).size],
    ["Poin dari admin", entries.length],
    ["Dibuat", `${wibStamp(now)} WIB`],
    ["Sumber", "WLM, Werkudara Journey"],
  ] };
  const activitySheet: SheetOut = {
    name: "Aktivitas", widths: [12, 8, 30, 26, 11, 12, 15, 10, 12, 13, 10, 12, 13, 14, 36, 36, 7, 17],
    rows: [
      ["Tanggal", "Jam", "Kegiatan", "Judul", "Jenis", "Dimensi", "Sumber", "Langkah", "Kalori (kkal)", "Durasi (menit)", "Jarak (km)", "Poin diklaim", "Poin dihitung", "Status", "Alasan admin", "Catatan", "Foto", "Dicatat (WIB)"],
      ...activities.map((item): Cell[] => [
        item.date, item.time, item.typeName, item.title && item.title !== item.typeName ? item.title : null,
        item.kind === "sport" ? "Olahraga" : "Harian", dimensionLabels[item.dimension], sourceLabels[item.source],
        item.steps, item.kcal, item.minutes, item.distanceM != null ? Math.round(item.distanceM / 100) / 10 : null,
        item.pointsClaimed, item.status === "rejected" ? 0 : item.points, myStatusOf(item), item.reason, item.note || null, item.photos.length, wibStamp(item.createdAt),
      ]),
    ],
  };
  const pointSheet: SheetOut = {
    name: "Poin dari admin", widths: [12, 10, 12, 50, 14],
    rows: [
      ["Tanggal", "Poin", "Dimensi", "Alasan", "Jenis"],
      ...entries.map((row): Cell[] => [
        row.happened_on as string, Number(row.points), row.dimension_id ? dimensionLabels[row.dimension_id as DimensionId] : null,
        row.reason as string, row.kind === "import" ? "Aplikasi lama" : "Admin",
      ]),
    ],
  };
  const stamp = range.from && range.to ? `${range.from}_${range.to}` : `semua-${today}`;
  return { file: writeXlsx([summary, activitySheet, pointSheet]), name: `rekap-wlm-${fileSlug(member.nickname || member.name)}-${stamp}.xlsx` };
}
