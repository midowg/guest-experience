import { z } from "zod";
import { minutesFileName } from "./minutes-message";

/*
 * Arsip MoM (12 Nov 2026): every sent MoM with its PDF and photos, in Admin WAM for the
 * administration team. The folders follow the panitia's documentation archive in Drive ("REKAP
 * DOKUMENTASI MEETING PRA WAM-NOVEMBER 2026 / DOKUMENTASI APPRAISAL / APPRAISAL-10 NOVEMBER 2026 /
 * TEAM SS"): month, activity, day, team; a meeting's folder holds its MoM PDF and its photos, the
 * same in the cabinet and in what is exported. Pure, so the folders and filters are tested here.
 */

export type CabinetPhoto = { id: string; width: number | null; height: number | null; size: number; at: string; onTv: boolean };
export type CabinetEntry = {
  sessionId: string;
  /**
   * The nomor surat MoM typed ("001/MoM/BAS/XI/2026"), else the automatic number
   * ("MoM/2026/11/0012"), or before the form its code "CoE-20261112-4F3A".
   */
  code: string;
  /** Whether `code` is a MoM number (typed or automatic), not the code; left out: told from its shape. */
  numbered?: boolean;
  title: string;
  /** YYYY-MM-DD and HH.MM (WIB). */
  date: string; from: string | null; to: string | null; place: string;
  /** The booker's department and its short form; a Meeting HOD or ITEM is the HOD group's. */
  department: string; short: string; hod: boolean;
  chair: string | null; notetaker: string | null;
  /** People on the list who came, all on the list, and others who came. */
  present: number; total: number; guests: number;
  topics: number; decisions: number; actions: number; open: number;
  version: number; sentAt: string; telegramOff: boolean;
  photos: CabinetPhoto[];
  /** The MoM uploaded as a file (13 Nov 2026), null when it was written in the form. */
  file?: { name: string; size: number; type: string } | null;
};
export type CabinetView = {
  /** The MoM tables are there. */
  migrated: boolean;
  /** Migration 202611120006: meeting photos can go to the TV (and are kept Full HD). */
  tvReady: boolean;
  entries: CabinetEntry[];
};

const MONTHS = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
const upper = (text: string) => text.trim().replace(/\s+/g, " ").toUpperCase();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A file or folder name every computer and zip accepts. */
export const safeName = (text: string) =>
  text.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 90).trim() || "-";

/** The activity of a meeting: its name without the team ("Appraisal team SS" → "Appraisal", "Review KPI SM" → "Review KPI"). */
export function activityOf(title: string, short: string): string {
  const clean = title.trim().replace(/\s+/g, " ");
  let name = clean.replace(/\s+(team|tim)(\s.*)?$/i, "");
  if (short) name = name.replace(new RegExp(`\\s+${escapeRegExp(short)}$`, "i"), "");
  return name.trim() || clean || "Meeting";
}

/** "2026-11" → "NOVEMBER 2026". */
export const monthName = (month: string) => { const [year, number] = month.split("-").map(Number); return `${MONTHS[number - 1]} ${year}`; };

/** A meeting's folder, as the panitia's archive names them. */
export function cabinetFolder(entry: Pick<CabinetEntry, "date" | "title" | "short" | "hod">): [string, string, string, string] {
  const [year, month, day] = entry.date.split("-").map(Number);
  const monthYear = `${MONTHS[month - 1]} ${year}`;
  const activity = upper(activityOf(entry.title, entry.short));
  return [
    `REKAP DOKUMENTASI MEETING-${monthYear}`,
    `DOKUMENTASI ${activity}`,
    `${activity}-${day} ${monthYear}`,
    entry.hod ? "TEAM HOD" : `TEAM ${upper(entry.short || "WAM")}`,
  ].map(safeName) as [string, string, string, string];
}

export type PlacedEntry = CabinetEntry & { path: [string, string, string, string] };
const when = (entry: CabinetEntry) => `${entry.date}T${entry.from ?? "99.99"}`;

/** Every MoM in its folder, oldest first; two meetings of one team on one day get " (2)". */
export function placeEntries(entries: readonly CabinetEntry[]): PlacedEntry[] {
  const seen = new Map<string, number>();
  return [...entries].sort((a, b) => when(a).localeCompare(when(b)) || a.code.localeCompare(b.code)).map(entry => {
    const path = cabinetFolder(entry);
    const key = path.join("/").toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) path[3] = safeName(`${path[3]} (${count})`);
    return { ...entry, path };
  });
}

/** What goes in a meeting's folder: its PDF and its photos, by these names. */
export const pdfName = (entry: Pick<CabinetEntry, "code" | "version" | "numbered">) => minutesFileName({ code: entry.code, version: entry.version, numbered: entry.numbered });
/** The uploaded file's name in a zip: the PDF's, "(berkas)", its own kind. */
export const uploadedName = (entry: Pick<CabinetEntry, "code" | "version" | "numbered" | "file">) =>
  pdfName(entry).replace(/\.pdf$/, ` (berkas).${entry.file?.name.split(".").pop() ?? "pdf"}`);
/** The Word file's name: the PDF's, as .docx. */
export const docxName = (entry: Pick<CabinetEntry, "code" | "version" | "numbered">) => pdfName(entry).replace(/\.pdf$/, ".docx");
export const photoName = (entry: Pick<CabinetEntry, "code">, index: number) => `${safeName(entry.code.replace(/\//g, "-"))}_foto-${String(index + 1).padStart(2, "0")}.jpg`;

export type CabinetFilter = { query: string; month: string; department: string };
export const NO_FILTER: CabinetFilter = { query: "", month: "", department: "" };
/** The months and departments that have MoMs, newest month first. */
export function filterOptions(entries: readonly CabinetEntry[]): { months: string[]; departments: string[] } {
  return {
    months: [...new Set(entries.map(entry => entry.date.slice(0, 7)))].sort().reverse(),
    departments: [...new Set(entries.map(entry => entry.department))].sort((a, b) => a.localeCompare(b, "id")),
  };
}
/** The MoMs that match: in the month, of the department, and with every word typed somewhere in number, meeting, department, chair or notetaker. */
export function filterEntries<T extends CabinetEntry>(entries: readonly T[], filter: CabinetFilter): T[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    if (filter.month && !entry.date.startsWith(filter.month)) return false;
    if (filter.department && entry.department !== filter.department) return false;
    const text = [entry.code, entry.title, entry.department, entry.short, entry.chair ?? "", entry.notetaker ?? "", entry.place].join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  });
}

/** What one export may hold, so the admin's browser is not asked for more than it can keep. */
export const CABINET_EXPORT_LIMIT = { files: 1500, bytes: 700 * 1024 * 1024 } as const;
export const cabinetExportSchema = z.object({ ids: z.array(z.uuid()).min(1, "Pilih minimal satu MoM.").max(1000, "Paling banyak 1000 MoM sekali ekspor.") });
export const cabinetTvSchema = z.object({ title: z.string().trim().max(80, "Judul paling panjang 80 karakter.").default("") });
/** Many photos to the TV at once (Galeri): each with its picture's name; the TV holds 30 pictures. */
export const cabinetTvManySchema = z.object({
  photos: z.array(z.object({ id: z.uuid(), title: z.string().trim().max(80).default("") })).min(1, "Pilih minimal satu foto.").max(30, "Paling banyak 30 foto sekali kirim ke TV."),
});
/** "Appraisal team SS · Sel, 10 Nov 2026", a picture's name on the TV, at most 80 characters. */
export const tvTitleOf = (entry: Pick<CabinetEntry, "title" | "date">) =>
  `${entry.title} · ${new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${entry.date}T00:00:00Z`))}`.slice(0, 80);
