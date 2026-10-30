#!/usr/bin/env node
// Regenerates the wording dictionary from the team's spreadsheet:
//   node scripts/wording-from-xlsx.mjs [docs/wording-draf.xlsx]
// Writes src/lib/wording/dictionary.ts (guest interface) and src/lib/wording/template-content.ts
// (starting copy for event templates). Uses only Node built-ins: an .xlsx file is a zip of XML.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const source = process.argv[2] ?? "docs/wording-draf.xlsx";

function unzip(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error(`${source} bukan berkas .xlsx yang valid.`);
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Direktori zip rusak.");
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(data).toString("utf8") : data.toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code) =>
  code[0] === "#" ? String.fromCodePoint(code[1] === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : entities[code] ?? match);
const texts = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join("");

function readSheets(files) {
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const rels = Object.fromEntries([...files.get("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)]
    .map(m => [/Id="([^"]+)"/.exec(m[0])[1], /Target="([^"]+)"/.exec(m[0])[1]]));
  const sheets = {};
  for (const m of files.get("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]+)"/.exec(m[0])[1]);
    const target = rels[/r:id="([^"]+)"/.exec(m[0])[1]].replace(/^\/?(xl\/)?/, "");
    const xml = files.get(`xl/${target}`);
    const rows = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = {};
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const column = /r="([A-Z]+)\d+"/.exec(cell[1])[1];
        const type = /t="([^"]+)"/.exec(cell[1])?.[1];
        const body = cell[2] ?? "";
        const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        cells[column] = type === "s" ? shared[Number(value)] : type === "inlineStr" ? texts(body) : value !== undefined ? decode(value) : "";
      }
      rows.push(cells);
    }
    sheets[name] = rows;
  }
  return sheets;
}

// The sheet uses Indonesian placeholder names in the Indonesian column; code passes one set.
const placeholderNames = { nama: "name", tanggal: "date", jam: "time", menit: "minutes", cuplikan: "teaser", waktu: "when", tempat: "place", jawaban: "answer", zona: "zone", namaZona: "zoneName", acara: "event", tautan: "link", batas: "deadline", malam: "nights" };
const known = new Set([...Object.values(placeholderNames), "n", "total", "offset"]);
const errors = [];
function normalise(text, key, column) {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    const canonical = placeholderNames[name] ?? name;
    if (!known.has(canonical)) errors.push(`${key} (${column}): variabel {${name}} tidak dikenal.`);
    return `{${canonical}}`;
  });
}

function table(rows, sheet) {
  const [header, ...body] = rows;
  const col = label => Object.keys(header).find(c => header[c] === label);
  const [key, idn, eng] = ["Kunci", "Indonesia", "English"].map(col);
  if (!key || !idn || !eng) throw new Error(`Lembar "${sheet}" harus punya kolom Kunci, Indonesia, dan English.`);
  const entries = [];
  const seen = new Set();
  for (const row of body) {
    const k = (row[key] ?? "").trim();
    if (!k) continue;
    if (seen.has(k)) errors.push(`${sheet}: kunci ${k} ganda.`);
    seen.add(k);
    const id = normalise(row[idn] ?? "", k, "Indonesia");
    if (!id.trim()) errors.push(`${sheet}: ${k} belum punya teks Indonesia.`);
    entries.push([k, id, normalise(row[eng] ?? "", k, "English")]);
  }
  return entries;
}

const sheets = readSheets(unzip(readFileSync(source)));
const ui = table(sheets["Antarmuka tamu"] ?? [], "Antarmuka tamu");
const templates = table(sheets["Isi awal templat"] ?? [], "Isi awal templat");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

const header = `// Dibuat otomatis oleh scripts/wording-from-xlsx.mjs dari ${source}. Jangan diubah manual:\n// ubah lembarnya, lalu jalankan \`npm run wording\`.\n`;
const object = (entries, index) => `{\n${entries.map(entry => `  ${JSON.stringify(entry[0])}: ${JSON.stringify(entry[index])},`).join("\n")}\n}`;
writeFileSync("src/lib/wording/dictionary.ts", `${header}
export const id = ${object(ui, 1)} as const;

export type WordKey = keyof typeof id;

/** An empty English text falls back to Indonesian at runtime. */
export const en: Record<WordKey, string> = ${object(ui, 2)};
`);
writeFileSync("src/lib/wording/template-content.ts", `${header}
/** Starting copy per template field, keyed "<template>.<field>". */
export const templateContent: Record<string, { id: string; en: string }> = {
${templates.map(([k, i, e]) => `  ${JSON.stringify(k)}: { id: ${JSON.stringify(i)}, en: ${JSON.stringify(e)} },`).join("\n")}
};
`);
console.log(`Kamus antarmuka: ${ui.length} kunci. Isi templat: ${templates.length} kunci.`);
