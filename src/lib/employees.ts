import { z } from "zod";

/*
 * Data karyawan: Werkudara's people, shared by every Journey app. HR keeps an Excel sheet; the
 * import reads it, tidies the capitals and the known typos, and matches each person by name so a
 * second import updates rather than doubles. Gender is in HR's sheet but no app needs it, so it is
 * left out.
 */

export const employeeCategories = ["karyawan", "ga", "intern"] as const;
export type EmployeeCategory = (typeof employeeCategories)[number];
export const categoryLabels: Record<EmployeeCategory, string> = { karyawan: "Karyawan", ga: "GA", intern: "Intern" };

export type Employee = {
  id: string; full_name: string; nickname: string; department: string; position: string; office: string;
  category: EmployeeCategory; phone: string; email: string; active: boolean;
  /** Nomor induk; empty until HR fills it (column from migration 202611040002). */
  nip: string;
  /** Business unit by code: MRP, WNS, TEE, NMU or WNN (migrations 202611060002, 202611060004); "" before them. */
  business_unit: string;
};
/** One person as read from HR's sheet; `email` and `nip` only when the sheet has them. */
export type EmployeeRow = Pick<Employee, "full_name" | "nickname" | "department" | "position" | "office" | "category"> & { email?: string; nip?: string };
const NIP = /^[0-9A-Za-z.-]{1,30}$/;

const text = (max: number) => z.string().trim().max(max);
export const employeeRowSchema = z.object({
  full_name: text(150).min(2, "Nama terlalu pendek."), nickname: text(60), department: text(150), position: text(150), office: text(20),
  category: z.enum(employeeCategories), email: z.union([z.literal(""), z.email("Email tidak valid.").max(200)]).optional(),
  nip: z.string().regex(NIP, "NIP hanya angka, huruf, titik, atau strip.").optional(),
});
export const employeeImportSchema = z.object({ rows: z.array(employeeRowSchema).min(1, "Tidak ada karyawan untuk disimpan.").max(2000) });
export const employeePatchSchema = z.object({
  full_name: text(150).min(2), nickname: text(60), department: text(150), position: text(150), office: text(20),
  category: z.enum(employeeCategories), phone: text(30), email: z.union([z.literal(""), z.email("Email tidak valid.").max(200)]), active: z.boolean(),
  nip: z.union([z.literal(""), z.string().trim().regex(NIP, "NIP hanya angka, huruf, titik, atau strip.")]),
  business_unit: text(120).min(1, "Pilih Business Unit."),
}).partial();
/** A person added by hand (Tambah karyawan): the name, department and job at least. */
export const employeeCreateSchema = z.object({
  full_name: text(150).min(2, "Isi nama lengkap."), nickname: text(60).default(""), department: text(150).min(1, "Pilih departemen."),
  position: text(150).min(1, "Isi jabatan."), office: text(20).default(""), category: z.enum(employeeCategories).default("karyawan"),
  phone: text(30).default(""), email: z.union([z.literal(""), z.email("Email tidak valid.").max(200)]).default(""),
  nip: z.union([z.literal(""), z.string().trim().regex(NIP, "NIP hanya angka, huruf, titik, atau strip.")]).default(""),
  business_unit: text(120).min(1).default("WNS"), active: z.boolean().default(true),
});

/** The matching key: the database derives the same one (upper case, single spaces). */
export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toUpperCase();

/** Words HR's sheet spells wrongly, set right on import. */
const typos: Record<string, string> = { TRANFORMATION: "TRANSFORMATION", BUSIENSS: "BUSINESS", SERVICESS: "SERVICES", MAKRETING: "MARKETING" };
/** Kept in capitals: abbreviations and the company codes. */
const acronyms = new Set(["AI", "HR", "GA", "IT", "3D", "CEO", "CFO", "COO", "CTO", "MD", "PIC", "PR", "BD", "MICE", "WNS", "TEE", "MRP", "UI", "UX"]);
const small = new Set(["of", "and", "the", "for", "in", "dan", "di", "&"]);

/** "HEAD OF BUSINESS TRANFORMATION & AI ENABLEMENT" → "Head of Business Transformation & AI Enablement". */
export function tidy(value: string): string {
  const words = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return words.map((raw, index) => {
    const word = typos[raw.toUpperCase()] ?? raw;
    const upper = word.toUpperCase();
    if (acronyms.has(upper)) return upper;
    const lower = word.toLowerCase();
    if (index > 0 && small.has(lower)) return lower;
    // Capitalise after a hyphen too (Abdul-Rahman), not after an apostrophe (Ma'ruf).
    return lower.replace(/(^|[-(/])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
  }).join(" ");
}

/** Pantry's category from the job title; anyone else is a karyawan, and the admin can change it. */
export function guessCategory(position: string): EmployeeCategory {
  const title = position.toUpperCase();
  if (/\b(INTERN|MAGANG)\b/.test(title)) return "intern";
  if (/^GENERAL AFFAIRS?$/.test(title.trim())) return "ga";
  return "karyawan";
}

const headers: Record<string, keyof Omit<EmployeeRow, "category">> = {
  EMAIL: "email", "E-MAIL": "email", "EMAIL KANTOR": "email", NIP: "nip", "NOMOR INDUK": "nip",
  "NAMA KARYAWAN": "full_name", "NAMA LENGKAP": "full_name", NAMA: "full_name", "NAMA PANGGILAN": "nickname", PANGGILAN: "nickname",
  DEPARTMENT: "department", DEPARTEMEN: "department", DIVISI: "department", POSITION: "position", JABATAN: "position", OFFICE: "office", KANTOR: "office", PERUSAHAAN: "office",
};

export type ParsedSheet = { sheet: string; rows: EmployeeRow[]; skipped: string[] };

/**
 * People from the workbook: the first sheet with a "Nama karyawan" header row. Rows without a name
 * (titles, totals, blanks) are skipped; a name met twice keeps its first row and is reported.
 */
export function employeesFromSheets(sheets: { name: string; rows: string[][] }[]): ParsedSheet {
  for (const sheet of sheets) {
    const headerAt = sheet.rows.findIndex(row => row.some(cell => headers[cell.trim().toUpperCase()] === "full_name") && row.some(cell => headers[cell.trim().toUpperCase()] === "position" || headers[cell.trim().toUpperCase()] === "department"));
    if (headerAt < 0) continue;
    const map = sheet.rows[headerAt].map(cell => headers[cell.trim().toUpperCase()]);
    const rows: EmployeeRow[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>();
    for (const cells of sheet.rows.slice(headerAt + 1)) {
      const row: Required<Omit<EmployeeRow, "category">> = { full_name: "", nickname: "", department: "", position: "", office: "", email: "", nip: "" };
      map.forEach((key, index) => { if (key && !row[key]) row[key] = (cells[index] ?? "").trim(); });
      if (row.full_name.length < 2) continue;
      const key = nameKey(row.full_name);
      if (seen.has(key)) { skipped.push(`${tidy(row.full_name)} tercantum dua kali; baris kedua dilewati.`); continue; }
      seen.add(key);
      const email = row.email.trim().toLowerCase();
      const nip = row.nip.trim();
      rows.push({
        full_name: tidy(row.full_name), nickname: tidy(row.nickname), department: tidy(row.department), position: tidy(row.position),
        office: row.office.trim().toUpperCase(), category: guessCategory(row.position),
        // A sheet email only fills an empty one later (compareImport), and only when it looks like one.
        ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
        ...(NIP.test(nip) ? { nip } : {}),
      });
    }
    return { sheet: sheet.name, rows, skipped };
  }
  return { sheet: "", rows: [], skipped: [] };
}

export type ImportChange = "baru" | "berubah" | "sama";
const fields = ["full_name", "nickname", "department", "position", "office"] as const;

/**
 * What an import would do to each person; the category set in the admin is not overwritten, and
 * the sheet's email and NIP only fill empty ones, so what the admin corrected stays.
 */
export function compareImport(rows: EmployeeRow[], current: Employee[]): { row: EmployeeRow; change: ImportChange; changed: string[] }[] {
  const byKey = new Map(current.map(person => [nameKey(person.full_name), person]));
  return rows.map(row => {
    const known = byKey.get(nameKey(row.full_name));
    if (!known) return { row, change: "baru", changed: [] };
    const changed: string[] = fields.filter(field => known[field] !== row[field]);
    if (row.email && !known.email) changed.push("email");
    if (row.nip && !known.nip) changed.push("nip");
    return { row, change: changed.length ? "berubah" : "sama", changed };
  });
}
