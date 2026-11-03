import "server-only";
import { inflateRawSync } from "node:zlib";

/*
 * Reads the cell text of an .xlsx file: a zip of XML parts. Only what an import needs (sheet names,
 * text and numbers by row); no formulas, styles or dates as dates. Sizes are capped so a crafted
 * file cannot expand without bound.
 */

const MAX_PART = 8 * 1024 * 1024;
const MAX_TOTAL = 24 * 1024 * 1024;

export type Sheet = { name: string; rows: string[][] };

class XlsxError extends Error {}

/** The zip's files by name, inflated. */
function unzip(file: Buffer): Map<string, Buffer> {
  // End of central directory: the last 0x06054b50 within the final 64 KB + 22 bytes.
  let end = -1;
  for (let i = file.length - 22; i >= Math.max(0, file.length - 65_557); i--) if (file.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new XlsxError("Berkas ini bukan Excel (.xlsx).");
  const count = file.readUInt16LE(end + 10);
  let at = file.readUInt32LE(end + 16);
  const parts = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > file.length || file.readUInt32LE(at) !== 0x02014b50) throw new XlsxError("Berkas Excel rusak.");
    const method = file.readUInt16LE(at + 10);
    const size = file.readUInt32LE(at + 20);
    const nameLength = file.readUInt16LE(at + 28), extra = file.readUInt16LE(at + 30), comment = file.readUInt16LE(at + 32);
    const local = file.readUInt32LE(at + 42);
    const name = file.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extra + comment;
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    if (local + 30 > file.length || file.readUInt32LE(local) !== 0x04034b50) throw new XlsxError("Berkas Excel rusak.");
    const start = local + 30 + file.readUInt16LE(local + 26) + file.readUInt16LE(local + 28);
    const raw = file.subarray(start, start + size);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: MAX_PART }) : null;
    if (!data) throw new XlsxError("Berkas Excel memakai kompresi yang tidak dikenal.");
    total += data.length;
    if (total > MAX_TOTAL) throw new XlsxError("Isi berkas Excel terlalu besar.");
    parts.set(name, data);
  }
  return parts;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) =>
  code[0] === "#" ? String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)) : entities[code] ?? whole);
/** The text of every <t> inside a fragment (rich text splits one string into runs). */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => decode(match[1])).join("");
const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** "C12" → column index 2. */
function column(ref: string): number {
  let index = 0;
  for (const letter of ref.replace(/\d+$/, "")) index = index * 26 + (letter.toUpperCase().charCodeAt(0) - 64);
  return index - 1;
}

/** Every sheet of the workbook, in order, as rows of cell text. */
export function readXlsx(file: Buffer): Sheet[] {
  const parts = unzip(file);
  const read = (name: string) => parts.get(name)?.toString("utf8") ?? "";
  const workbook = read("xl/workbook.xml");
  if (!workbook) throw new XlsxError("Berkas ini bukan Excel (.xlsx).");
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => texts(match[1]));
  const targets = new Map([...read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\s[^>]*>/g)].map(match => [attribute(match[0], "Id") ?? "", attribute(match[0], "Target") ?? ""]));
  return [...workbook.matchAll(/<sheet\s[^>]*>/g)].map(match => {
    const target = targets.get(attribute(match[0], "r:id") ?? "") ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const rows: string[][] = [];
    for (const row of read(path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attribute(cell[0], "r");
        const type = attribute(cell[0], "t");
        const inner = cell[2] ?? "";
        const value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        const text = type === "s" ? shared[Number(value)] ?? "" : type === "inlineStr" ? texts(inner) : decode(value);
        cells[ref ? column(ref) : cells.length] = text;
      }
      rows.push(Array.from(cells, cell => cell ?? ""));
    }
    return { name: decode(attribute(match[0], "name") ?? ""), rows };
  });
}

export { XlsxError };
