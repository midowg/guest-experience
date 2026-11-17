import "server-only";
import { z } from "zod";
import { DIMENSIONS, dimensionLabels, monthRange, previousMonth, rank, wibToday, type DimensionId } from "@/lib/wellbeing/rules";
import type { WbActivity } from "@/lib/wellbeing/types";
import { databaseError } from "../http";
import { writeXlsx, type Cell, type SheetOut } from "../xlsx-write";
import { ACTIVITY_COLUMNS, ACTIVITY_FILTERS, ACTIVITY_KINDS, employees, toActivity, type Actor } from "./admin";
import { db, missing, readAll, readTotals, waiting, withTime, withTimeColumn } from "./shared";

/*
 * Admin Wellbeing → Laporan (17 Nov 2026): the data as an Excel workbook for reports, chosen by the
 * admin: points per employee (a recap for prizes and HR), the activities (filtered like Periksa, or the
 * ones ticked there), or the points an admin gave. Numbers are number cells (Excel can sum them);
 * every file starts with a Keterangan sheet saying what it holds, for which period, made when and by whom.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const EXPORT_DATA = ["people", "activities", "points"] as const;
export const EXPORT_PERIODS = ["month", "last_month", "range", "all"] as const;
export const exportSchema = z.object({
  data: z.enum(EXPORT_DATA),
  period: z.enum(EXPORT_PERIODS).default("month"),
  from: z.string().regex(DAY, "Tanggal mulai tidak valid.").nullish(),
  to: z.string().regex(DAY, "Tanggal akhir tidak valid.").nullish(),
  status: z.enum(ACTIVITY_FILTERS).default("all"),
  kind: z.enum(ACTIVITY_KINDS).default("all"),
  /** Only these activities (ticked in Periksa); the period and filters are then not used. */
  ids: z.array(z.uuid()).min(1).max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.period === "range" && (!value.from || !value.to)) ctx.addIssue({ code: "custom", path: ["from"], message: "Isi tanggal mulai dan akhir." });
  if (value.from && value.to && value.from > value.to) ctx.addIssue({ code: "custom", path: ["to"], message: "Tanggal akhir sebelum tanggal mulai." });
});
export type ExportInput = z.infer<typeof exportSchema>;

const dataTitles: Record<ExportInput["data"], string> = { people: "Rekap poin per karyawan", activities: "Daftar aktivitas", points: "Poin dari admin" };
const statusLabels: Record<(typeof ACTIVITY_FILTERS)[number], string> = { all: "Semua status", unchecked: "Belum diperiksa", adjusted: "Diubah admin", rejected: "Ditolak" };
const kindLabels: Record<(typeof ACTIVITY_KINDS)[number], string> = { all: "Semua jenis", daily: "Kegiatan harian", sport: "Olahraga", strava: "Dari Strava" };
const sourceLabels: Record<WbActivity["source"], string> = { manual: "Dicatat sendiri", strava: "Strava", import: "Aplikasi lama" };
const statusOf = (item: WbActivity) => item.status === "rejected" ? "Ditolak" : item.status === "adjusted" ? "Diubah admin" : "Disetujui";

const longDay = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const wibStamp = (iso: string | Date) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(typeof iso === "string" ? new Date(iso) : iso).replace(",", "");

/** The period as dates (null for all time). */
export function periodOf(input: Pick<ExportInput, "period" | "from" | "to">, today: string): { from: string | null; to: string | null } {
  if (input.period === "month") return monthRange(today);
  if (input.period === "last_month") return previousMonth(today);
  if (input.period === "range") return { from: input.from ?? null, to: input.to ?? null };
  return { from: null, to: null };
}
const periodText = (range: { from: string | null; to: string | null }) => range.from && range.to ? `${longDay(range.from)} – ${longDay(range.to)}` : "Sepanjang program";

export async function exportWorkbook(input: ExportInput, actor: Actor, now = new Date()): Promise<{ file: Buffer; name: string }> {
  const today = wibToday(now);
  const range = input.ids ? { from: null, to: null } : periodOf(input, today);
  const data = input.data === "people" ? await peopleSheet(range) : input.data === "activities" ? await activitiesSheet(input, range) : await pointsSheet(range);
  const filters = input.data === "activities" ? input.ids ? `${input.ids.length} aktivitas yang dipilih di Periksa` : `${statusLabels[input.status]}, ${kindLabels[input.kind]}` : "-";
  const info: SheetOut = { name: "Keterangan", widths: [22, 60], rows: [
    ["Laporan", dataTitles[input.data]],
    ["Periode", input.ids ? "-" : periodText(range)],
    ["Saringan", filters],
    ["Jumlah baris", data.rows.length - 1],
    ["Dibuat", `${wibStamp(now)} WIB`],
    ["Oleh", actor.name],
    ["Sumber", "Admin Wellbeing, Werkudara Journey"],
  ] };
  const stamp = range.from && range.to ? `${range.from}_${range.to}` : input.ids ? `pilihan-${today}` : `semua-${today}`;
  return { file: writeXlsx([data, info]), name: `wellbeing-${{ people: "rekap-poin", activities: "aktivitas", points: "poin-admin" }[input.data]}-${stamp}.xlsx` };
}

/** Points per employee in the period, per dimension, ranked (ties share a place); active employees without points are listed too. */
async function peopleSheet(range: { from: string | null; to: string | null }): Promise<SheetOut> {
  const [people, totals] = await Promise.all([employees(), readTotals(range.from, range.to)]);
  if (!totals.migrated) throw waiting();
  const sums = new Map<string, { points: number; activities: number; dims: Record<DimensionId, number>; other: number }>();
  for (const row of totals.rows) {
    const entry = sums.get(row.employee_id) ?? { points: 0, activities: 0, dims: { physical: 0, emotional: 0, social: 0, financial: 0, spiritual: 0 }, other: 0 };
    entry.points += row.points; entry.activities += row.activities;
    if (row.dimension_id) entry.dims[row.dimension_id] += row.points; else entry.other += row.points;
    sums.set(row.employee_id, entry);
  }
  const listed = people.filter(person => person.active || sums.has(person.id)).map(person => ({ person, points: sums.get(person.id)?.points ?? 0, sum: sums.get(person.id) }));
  const ranked = rank(listed.filter(row => row.points > 0)).concat(listed.filter(row => row.points <= 0).map(row => ({ ...row, rank: 0 })));
  ranked.sort((a, b) => b.points - a.points || a.person.full_name.localeCompare(b.person.full_name, "id"));
  return {
    name: "Rekap poin", widths: [10, 30, 16, 28, 26, 10, 12, ...DIMENSIONS.map(() => 12), 14, 12],
    rows: [
      ["Peringkat", "Nama", "Nama panggilan", "Divisi", "Jabatan", "Status", "Total poin", ...DIMENSIONS.map(dimension => dimensionLabels[dimension]), "Poin lain", "Aktivitas"],
      ...ranked.map(({ person, points, sum, rank: place }): Cell[] => [
        place || null, person.full_name, person.nickname || null, person.department || null, person.position || null, person.active ? "Aktif" : "Nonaktif", points,
        ...DIMENSIONS.map(dimension => sum?.dims[dimension] ?? 0), sum?.other ?? 0, sum?.activities ?? 0,
      ]),
    ],
  };
}

async function activitiesSheet(input: ExportInput, range: { from: string | null; to: string | null }): Promise<SheetOut> {
  const { rows, error } = await readAll((start, end) => withTimeColumn(on => {
    let request = db().from("wb_activities").select(withTime(ACTIVITY_COLUMNS, on)).order("happened_on", { ascending: true }).order("created_at", { ascending: true }).order("id");
    if (input.ids) request = request.in("id", input.ids);
    else {
      if (range.from) request = request.gte("happened_on", range.from);
      if (range.to) request = request.lte("happened_on", range.to);
      if (input.status === "unchecked") request = request.eq("checked", false);
      if (input.status === "adjusted" || input.status === "rejected") request = request.eq("status", input.status);
      if (input.kind === "strava") request = request.eq("source", "strava");
      if (input.kind === "sport") request = request.like("type_code", "sport.%");
      if (input.kind === "daily") request = request.not("type_code", "like", "sport.%");
    }
    return request.range(start, end);
  }), 60);
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  const items = rows.map(toActivity);
  return {
    name: "Aktivitas", widths: [12, 8, 28, 24, 30, 26, 12, 12, 14, 10, 10, 10, 10, 12, 12, 14, 11, 30, 18, 36, 8, 17],
    rows: [
      ["Tanggal", "Jam", "Nama", "Divisi", "Kegiatan", "Judul", "Jenis", "Dimensi", "Sumber", "Langkah", "Kalori (kkal)", "Durasi (menit)", "Jarak (km)", "Poin diklaim", "Poin dihitung", "Status", "Diperiksa", "Alasan admin", "Diperiksa oleh", "Catatan karyawan", "Foto", "Dicatat (WIB)"],
      ...items.map((item): Cell[] => [
        item.date, item.time, item.employeeName || null, item.department || null, item.typeName, item.title && item.title !== item.typeName ? item.title : null,
        item.kind === "sport" ? "Olahraga" : "Harian", dimensionLabels[item.dimension], sourceLabels[item.source],
        item.steps, item.kcal, item.minutes, item.distanceM != null ? Math.round(item.distanceM / 100) / 10 : null,
        item.pointsClaimed, item.status === "rejected" ? 0 : item.points, statusOf(item), item.checked ? "Ya" : "Belum", item.reason, item.reviewedBy, item.note || null, item.photos.length, wibStamp(item.createdAt),
      ]),
    ],
  };
}

async function pointsSheet(range: { from: string | null; to: string | null }): Promise<SheetOut> {
  const [people, read] = await Promise.all([employees(), readAll((start, end) => {
    let request = db().from("wb_point_entries").select("id,employee_id,points,dimension_id,reason,happened_on,kind,created_by_name,created_at,voided_at,voided_by_name").order("happened_on", { ascending: true }).order("created_at").order("id");
    if (range.from) request = request.gte("happened_on", range.from);
    if (range.to) request = request.lte("happened_on", range.to);
    return request.range(start, end);
  }, 60)]);
  if (read.error) { if (missing(read.error)) throw waiting(); databaseError(read.error); }
  const named = new Map(people.map(person => [person.id, person]));
  return {
    name: "Poin admin", widths: [12, 28, 24, 10, 12, 44, 12, 22, 12, 17],
    rows: [
      ["Tanggal", "Nama", "Divisi", "Poin", "Dimensi", "Alasan", "Jenis", "Oleh", "Dibatalkan", "Dicatat (WIB)"],
      ...read.rows.map((row): Cell[] => {
        const person = named.get(row.employee_id as string);
        return [
          row.happened_on as string, person?.full_name ?? "(tidak dikenal)", person?.department || null, Number(row.points),
          row.dimension_id ? dimensionLabels[row.dimension_id as DimensionId] : null, row.reason as string, row.kind === "import" ? "Aplikasi lama" : "Admin",
          (row.created_by_name as string | null) ?? null, row.voided_at ? `Ya${row.voided_by_name ? ` (${row.voided_by_name as string})` : ""}` : "Tidak", wibStamp(row.created_at as string),
        ];
      }),
    ],
  };
}
