import type { DailyRecord, DayView } from "./attendance";
import { covers, type LeaveType } from "./leave";

/*
 * Admin HR's tables (21 Nov 2026, the owner asked for "seperti Excel, berwarna"): what one person's
 * day was, as one coloured cell with a letter (never the colour alone). Pure, so it is tested
 * without a server. Which wins, in order:
 *   1. an approved cuti, sakit, izin or dinas;
 *   2. a masuk (or only a pulang): Dinas, Event, WFH or Di luar by the reason given outside the
 *      office; in the office Telat when masuk is after the late time (in the office's own zone; not
 *      on Saturday and Sunday), else Hadir; a refused masuk is Ditolak (a refused pulang only counts
 *      as missing). Still to check, or missing masuk or pulang on a past day, are marks on top;
 *   3. nothing recorded: a waiting cuti/sakit/izin/dinas (shown as waiting), Libur on Saturday and
 *      Sunday, nothing for days to come, for today, and before absensi started (`since`), else
 *      Tidak absen.
 */

export const CELL_KINDS = ["hadir", "telat", "cuti", "sakit", "izin", "dinas", "event", "wfh", "luar", "ditolak", "alpa", "libur", "belum", "nanti"] as const;
export type CellKind = (typeof CELL_KINDS)[number];
export const cellLabels: Record<CellKind, string> = {
  hadir: "Hadir", telat: "Telat", cuti: "Cuti", sakit: "Sakit", izin: "Izin", dinas: "Dinas", event: "Event", wfh: "WFH", luar: "Di luar",
  ditolak: "Ditolak", alpa: "Tidak absen", libur: "Libur", belum: "Belum absen", nanti: "",
};
/** The letter in the cell, as in a paper attendance sheet. */
export const cellCodes: Record<CellKind, string> = {
  hadir: "H", telat: "T", cuti: "C", sakit: "S", izin: "I", dinas: "D", event: "E", wfh: "W", luar: "L", ditolak: "X", alpa: "A", libur: "", belum: "", nanti: "",
};
/** The kinds in the legend, in its order. */
export const LEGEND: CellKind[] = ["hadir", "telat", "cuti", "sakit", "izin", "dinas", "event", "wfh", "luar", "alpa", "ditolak", "libur"];

export type Cell = {
  date: string; kind: CellKind;
  /** A cuti/sakit/izin/dinas that still waits for Admin HR. */
  waiting: boolean;
  /** A clock-in that still waits to be checked. */
  check: boolean;
  /** A past day with masuk but no pulang, or the other way round. */
  incomplete: boolean;
  /** Masuk and pulang in the office's zone ("08.52"), when there are. */
  masuk: string | null; pulang: string | null;
};
type DayRecord = Pick<DailyRecord, "status" | "reasonKind" | "officeName" | "method"> & { local: string };
export type DayInput = {
  date: string; today: string; lateAfter: string;
  /** The first day anyone clocked in (the pilot's start); earlier days are left blank, not Tidak absen. */
  since?: string | null;
  masuk: DayRecord | null; pulang: DayRecord | null;
  leaves: { type: LeaveType; startDate: string; endDate: string; status: "menunggu" | "disetujui" }[];
};

/** Saturday or Sunday. */
export const isWeekend = (date: string) => { const day = new Date(`${date}T12:00:00Z`).getUTCDay(); return day === 0 || day === 6; };
const clock = (local: string) => local.slice(0, 5).replace(":", ".");

/** One person's one day, as a cell. */
export function cellOf({ date, today, lateAfter, since = null, masuk, pulang, leaves }: DayInput): Cell {
  const base = { date, waiting: false, check: false, incomplete: false, masuk: masuk ? clock(masuk.local) : null, pulang: pulang ? clock(pulang.local) : null };
  const approved = leaves.find(leave => leave.status === "disetujui" && covers(leave, date));
  if (approved) return { ...base, kind: approved.type };
  // A refused pulang does not undo the day: it only leaves the pulang missing.
  const pulangKept = pulang?.status === "ditolak" && masuk && masuk.status !== "ditolak" ? null : pulang;
  const first = masuk ?? pulangKept;
  if (first) {
    const check = [masuk, pulangKept].some(record => record?.status === "perlu_cek");
    const incomplete = date < today && !(masuk && pulangKept);
    if (first.status === "ditolak") return { ...base, kind: "ditolak", check, incomplete };
    const reason = first.reasonKind;
    const kind: CellKind = reason === "dinas" ? "dinas" : reason === "event" ? "event" : reason === "wfh" ? "wfh" : reason === "lainnya" ? "luar"
      // Outside every office point with no reason (none before 20 Nov); a record made by Admin HR counts as in the office.
      : !first.officeName && first.method === "wajah" ? "luar"
        : masuk && !isWeekend(date) && masuk.local.slice(0, 5) > lateAfter.slice(0, 5) ? "telat" : "hadir";
    return { ...base, kind, check, incomplete };
  }
  const waiting = leaves.find(leave => leave.status === "menunggu" && covers(leave, date));
  if (waiting) return { ...base, kind: waiting.type, waiting: true };
  if (isWeekend(date)) return { ...base, kind: "libur" };
  if (date > today || (since && date < since)) return { ...base, kind: "nanti" };
  if (date === today) return { ...base, kind: "belum" };
  return { ...base, kind: "alpa" };
}

/** The counts at the end of a person's row: days present (Hadir + Telat + Dinas + Event + WFH + Di luar), each kind. */
export function countCells(cells: Cell[]): Record<CellKind, number> & { masuk: number } {
  const counts = Object.fromEntries(CELL_KINDS.map(kind => [kind, 0])) as Record<CellKind, number>;
  for (const cell of cells) if (!cell.waiting) counts[cell.kind] += 1;
  const masuk = counts.hadir + counts.telat + counts.event + counts.wfh + counts.luar + cells.filter(cell => cell.kind === "dinas" && cell.masuk).length;
  return { ...counts, masuk };
}

/** What a cell says in words (its title and what screen readers hear). */
export function cellWords(cell: Cell): string {
  if (cell.kind === "nanti") return "belum terjadi";
  const parts = [cellLabels[cell.kind] + (cell.waiting ? " (menunggu persetujuan)" : "")];
  if (cell.masuk || cell.pulang) parts.push(`masuk ${cell.masuk ?? "—"}, pulang ${cell.pulang ?? "—"}`);
  if (cell.incomplete) parts.push(cell.masuk ? "belum absen pulang" : "tanpa absen masuk");
  if (cell.check) parts.push("perlu dicek");
  return parts.join(", ");
}

/** Absen harian's data: the day (DayView) with each person's cell and the late time. */
export type DayTable = Omit<DayView, "people"> & { lateAfter: string; leaveReady: boolean; people: (DayView["people"][number] & { cell: Cell })[] };
/** Rekap bulanan's data: everyone who clocks in × every date of the month. */
export type MonthTable = { month: string; today: string; lateAfter: string; leaveReady: boolean; since: string | null; dates: string[]; people: { employeeId: string; name: string; department: string; cells: Cell[] }[] };
