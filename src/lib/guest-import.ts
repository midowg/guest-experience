import { parseContactPhone } from "./contact-phone";

/** One guest as imported: international WhatsApp digits (628…) and total people allowed. */
export type GuestRow = { name: string; phone: string | null; party_size_max: number };
export type ParsedGuest = GuestRow & { line: number; errors: string[]; duplicate: string | null };

export const MAX_IMPORT = 500;
export const MAX_COMPANIONS = 9;

/** Quoted CSV fields may hold the delimiter, quotes ("") and line breaks. */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map(cells => cells.map(cell => cell.trim())).filter(cells => cells.some(Boolean));
}

const headerWords = {
  name: /^(nama|name|nama tamu|nama sapaan|tamu)$/i,
  phone: /(wa|whatsapp|hp|telepon|telp|phone|nomor|no\.?)/i,
  companions: /(pendamping|companion|plus|\+1|tambahan)/i,
};

/**
 * Reads pasted spreadsheet rows (tab-separated) or CSV (comma or semicolon). A first row that
 * names its columns decides the order; otherwise the order is name, WhatsApp, companions.
 */
export function parseGuestList(text: string, existing: { name: string; phone: string | null }[] = []): ParsedGuest[] {
  const sample = text.split(/\r?\n/).find(line => line.trim()) ?? "";
  const delimiter = sample.includes("\t") ? "\t" : sample.split(";").length > sample.split(",").length ? ";" : ",";
  let rows = splitRows(text, delimiter);
  let columns = { name: 0, phone: 1, companions: 2 };
  let offset = 1;
  if (rows[0]?.some(cell => headerWords.name.test(cell))) {
    const header = rows[0];
    const find = (pattern: RegExp, fallback: number) => { const index = header.findIndex(cell => pattern.test(cell)); return index < 0 ? fallback : index; };
    columns = { name: find(headerWords.name, 0), phone: find(headerWords.phone, -1), companions: find(headerWords.companions, -1) };
    rows = rows.slice(1); offset = 2;
  }
  const knownPhones = new Map(existing.filter(guest => guest.phone).map(guest => [guest.phone!, guest.name]));
  const knownNames = new Set(existing.map(guest => guest.name.trim().toLowerCase()));
  const seenPhones = new Map<string, number>();
  const seenNames = new Map<string, number>();
  return rows.map((cells, index) => {
    const line = index + offset;
    const errors: string[] = [];
    const name = (cells[columns.name] ?? "").replace(/\s+/g, " ").trim();
    if (!name) errors.push("Nama kosong.");
    else if (name.length > 150) errors.push("Nama lebih dari 150 karakter.");
    const rawPhone = columns.phone >= 0 ? cells[columns.phone] ?? "" : "";
    let phone: string | null = null;
    if (rawPhone) {
      const parsed = parseContactPhone(rawPhone);
      if (parsed) phone = parsed.international;
      else errors.push("Nomor WA bukan nomor HP Indonesia (contoh 0812 3456 7890).");
    }
    const rawCompanions = columns.companions >= 0 ? (cells[columns.companions] ?? "").trim() : "";
    let companions = 0;
    if (rawCompanions) {
      if (!/^\d{1,2}$/.test(rawCompanions) || Number(rawCompanions) > MAX_COMPANIONS) errors.push(`Pendamping harus angka 0–${MAX_COMPANIONS}.`);
      else companions = Number(rawCompanions);
    }
    let duplicate: string | null = null;
    const key = name.toLowerCase();
    if (phone && knownPhones.has(phone)) duplicate = `Nomor sama dengan ${knownPhones.get(phone)} di daftar.`;
    else if (phone && seenPhones.has(phone)) duplicate = `Nomor sama dengan baris ${seenPhones.get(phone)}.`;
    else if (name && knownNames.has(key)) duplicate = "Nama sudah ada di daftar.";
    else if (name && seenNames.has(key)) duplicate = `Nama sama dengan baris ${seenNames.get(key)}.`;
    if (phone && !seenPhones.has(phone)) seenPhones.set(phone, line);
    if (name && !seenNames.has(key)) seenNames.set(key, line);
    return { line, name, phone, party_size_max: companions + 1, errors, duplicate };
  });
}

/** "6281234567890" → "0812 3456 7890" for display. */
export function localPhone(international: string | null): string {
  if (!international) return "";
  const local = `0${international.slice(2)}`;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1 $2 $3");
}
