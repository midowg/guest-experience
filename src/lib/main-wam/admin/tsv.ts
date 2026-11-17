/*
 * Admin WAM → Main WAM: what an admin pastes from Excel or Google Sheets (tab-separated, the way
 * both copy cells). Shared by every import of the isi acara pages (rundown, kelompok, kelompok
 * kegiatan, kursi). Pure: tested without a browser or server.
 */

/** At most this many rows per paste (120 people, ±30 sessions a day: well under it). */
export const MAX_PASTE_ROWS = 500;
/** And this many characters (a pasted sheet of 500 rows with long cells). */
export const MAX_PASTE_CHARS = 200_000;

/**
 * The cells of a paste, row by row. Excel quotes a cell that holds a tab, a line break or a quote
 * ("a ""b"""), so a quoted cell may span lines. A paste without tabs but with semicolons or commas
 * (a CSV opened as text) is split on those. Blank rows are dropped; cells are trimmed.
 */
export function parseTsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const sample = clean.split(/\r?\n/).find(line => line.trim()) ?? "";
  const delimiter = sample.includes("\t") ? "\t" : sample.includes(";") ? ";" : sample.includes(",") ? "," : "\t";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(cells => cells.map(value => value.replace(/\s+/g, " ").trim())).filter(cells => cells.some(Boolean));
}

/** Lower case, no accents, single spaces: how names and headers are compared. */
export const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Which column holds what: a header row that names the columns, or the default order. */
export type ColumnMap<K extends string> = Record<K, number>;

/**
 * Reads the header row when the first row names at least `need` of the columns (by the patterns),
 * so columns may come in any order; otherwise `fallback` (the documented order) and every row is data.
 */
export function readColumns<K extends string>(rows: string[][], patterns: Record<K, RegExp>, fallback: ColumnMap<K>, need = 2): { columns: ColumnMap<K>; header: boolean } {
  const first = rows[0] ?? [];
  const found = Object.fromEntries(Object.keys(patterns).map(key => [key, -1])) as ColumnMap<K>;
  const used = new Set<number>();
  for (const key of Object.keys(patterns) as K[]) {
    const index = first.findIndex((cell, at) => !used.has(at) && patterns[key].test(fold(cell)));
    if (index >= 0) { found[key] = index; used.add(index); }
  }
  const named = Object.values<number>(found).filter(index => index >= 0).length;
  return named >= need ? { columns: found, header: true } : { columns: fallback, header: false };
}

/** One cell by column (empty when the column is absent or the row is short). */
export const cellAt = (cells: string[], index: number) => (index >= 0 ? cells[index] ?? "" : "");

/** "ya", "y", "1", "v", "✓", "true", "wajib" → true; "", "tidak", "-", "0", "false" → false; anything else → null. */
export function yesNo(value: string): boolean | null {
  const word = fold(value);
  if (!word || ["tidak", "tdk", "t", "n", "no", "0", "-", "false", "bukan"].includes(word)) return false;
  if (["ya", "y", "iya", "yes", "1", "v", "✓", "√", "true", "wajib", "pakai", "ada"].includes(word)) return true;
  return null;
}

/**
 * A clock time as people type it in a sheet: "08.00", "8:00", "08:00:00", "8.30 PM", "0800".
 * Returns "HH:MM" (24 h) or null.
 */
export function clockTime(value: string): string | null {
  const text = fold(value).replace(/\s+/g, "");
  const match = text.match(/^(\d{1,2})(?:[.:](\d{2}))?(?:[.:]\d{2})?(am|pm)?$/) ?? text.match(/^(\d{2})(\d{2})$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const half = match[3];
  if (half) { if (hour < 1 || hour > 12) return null; hour = (hour % 12) + (half === "pm" ? 12 : 0); }
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "08:00" → "08.00" (how the app writes times). */
export const dotTime = (time: string) => time.replace(":", ".");

const MONTHS = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];
const MONTH_ALIASES: Record<string, number> = { may: 4, aug: 7, oct: 9, dec: 11, agt: 7, ags: 7 };

/**
 * The event day a cell means, as its date: "1".."N" or "Hari 2" (day number), "2027-01-05",
 * "5/1/2027" (day first), "5 Jan", "Sel, 5 Jan 2027". Null when it is not one of `dates`.
 */
export function eventDayDate(value: string, dates: readonly string[]): string | null {
  const text = fold(value);
  if (!text) return null;
  const numbered = text.match(/^(?:hari(?: ke)?[- ]?)?(\d{1,2})$/);
  if (numbered) return dates[Number(numbered[1]) - 1] ?? null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return dates.includes(text) ? text : null;
  const slashed = text.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (slashed) return pick(dates, Number(slashed[1]), Number(slashed[2]) - 1, slashed[3]);
  const named = text.replace(/^[a-z]+,?\s+/, "").match(/^(\d{1,2})\s+([a-z]+)\.?(?:\s+(\d{4}))?$/) ?? text.match(/^(\d{1,2})\s+([a-z]+)\.?(?:\s+(\d{4}))?$/);
  if (named) {
    const word = named[2].slice(0, 3);
    const month = MONTHS.indexOf(word) >= 0 ? MONTHS.indexOf(word) : MONTH_ALIASES[word] ?? MONTH_ALIASES[named[2]] ?? -1;
    return month < 0 ? null : pick(dates, Number(named[1]), month, named[3]);
  }
  return null;
}

function pick(dates: readonly string[], day: number, month: number, year?: string): string | null {
  const full = year ? (year.length === 2 ? `20${year}` : year) : null;
  return dates.find(date => {
    const [y, m, d] = date.split("-").map(Number);
    return d === day && m - 1 === month && (!full || y === Number(full));
  }) ?? null;
}

/**
 * A number as Indonesians type it: "1.240" (thousands), "13,6" (decimal), "12.5", "1.240,5". Null
 * for an empty field, undefined for something that is not a number.
 */
export function parseAmount(value: string): number | null | undefined {
  const text = value.replace(/\s+/g, "");
  if (!text) return null;
  if (!/^-?[\d.,]+$/.test(text)) return undefined;
  let normal: string;
  if (text.includes(",")) normal = text.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) normal = text.replace(/\./g, "");
  else normal = text;
  if ((normal.match(/\./g) ?? []).length > 1 || normal.includes(",")) return undefined;
  const number = Number(normal);
  return Number.isFinite(number) ? number : undefined;
}
/** 13.6 → "13,6", 1240 → "1240" (no thousands in a field being edited). */
export const amountText = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));
