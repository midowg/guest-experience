import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { compareImport, employeesFromSheets, guessCategory, nameKey, tidy, type Employee } from "./employees";
import { readXlsx } from "./server/xlsx";

/** A minimal .xlsx: a zip of the parts readXlsx reads, the sheet deflated and the rest stored. */
function workbook(sheets: { name: string; xml: string }[], shared: string[]): Buffer {
  const files: [string, string][] = [
    ["xl/workbook.xml", `<workbook><sheets>${sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`],
    ["xl/sharedStrings.xml", `<sst>${shared.map(text => `<si><t>${text}</t></si>`).join("")}</sst>`],
    ...sheets.map((sheet, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, `<worksheet><sheetData>${sheet.xml}</sheetData></worksheet>`]),
  ];
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text, "utf8");
    const deflate = name.includes("worksheets");
    const body = deflate ? deflateRawSync(raw) : raw;
    const fileName = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(deflate ? 8 : 0, 8); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(deflate ? 8 : 0, 10); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(fileName.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, body); centrals.push(central, fileName);
    offset += 30 + fileName.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const cell = (ref: string, index: number) => `<c r="${ref}" t="s"><v>${index}</v></c>`;

describe("readXlsx", () => {
  it("reads shared and inline strings, numbers and entities by column, in sheet order", () => {
    const file = workbook([
      { name: "Summary", xml: `<row r="1">${cell("A1", 0)}<c r="B1"><v>4</v></c></row>` },
      { name: "Data", xml: `<row r="2">${cell("A2", 1)}<c r="C2" t="inlineStr"><is><t>Art &amp; Creative</t></is></c></row>` },
    ], ["ACCOUNTING", "NAMA KARYAWAN"]);
    expect(readXlsx(file)).toEqual([
      { name: "Summary", rows: [["ACCOUNTING", "4"]] },
      // A gap between columns stays a gap, so the headers line up with their cells.
      { name: "Data", rows: [["NAMA KARYAWAN", "", "Art & Creative"]] },
    ]);
  });

  it("refuses a file that is not a workbook", () => {
    expect(() => readXlsx(Buffer.from("bukan excel sama sekali, hanya teks biasa yang cukup panjang"))).toThrow(/bukan Excel/);
  });
});

describe("tidying HR's sheet", () => {
  it("writes capitals as names and titles, keeps abbreviations and fixes the known typos", () => {
    expect(tidy("I GUSTI PUTU  CONTOH")).toBe("I Gusti Putu Contoh");
    expect(tidy("HEAD OF BUSINESS TRANFORMATION & AI ENABLEMENT")).toBe("Head of Business Transformation & AI Enablement");
    expect(tidy("BUSINESS & ADMINISTRATIVE SERVICESS STAFF")).toBe("Business & Administrative Services Staff");
    expect(tidy("HUMAN RESOURCES & GENERAL AFFAIR")).toBe("Human Resources & General Affair");
    expect(tidy("3D DESIGN")).toBe("3D Design");
    expect(tidy("ABDUL-RAHMAN MA'RUF")).toBe("Abdul-Rahman Ma'ruf");
  });

  it("guesses the Pantry category from the title, karyawan unless it says otherwise", () => {
    expect(guessCategory("GENERAL AFFAIR")).toBe("ga");
    expect(guessCategory("Intern Desain")).toBe("intern");
    expect(guessCategory("HUMAN RESOURCES & GENERAL AFFAIR MANAGER")).toBe("karyawan");
    expect(nameKey("  contoh   nama ")).toBe("CONTOH NAMA");
  });
});

describe("employeesFromSheets", () => {
  const sheets = [
    { name: "Summary", rows: [["NAMA DEPARTEMEN", "TOTAL"], ["ACCOUNTING", "4"]] },
    { name: "Data", rows: [
      ["DATA KARYAWAN 2026"],
      ["NO", "NAMA KARYAWAN", "NAMA PANGGILAN", "GENDER", "DEPARTMENT", "POSITION", "OFFICE"],
      ["1", "CONTOH SATU", "SATU", "LAKI-LAKI", "SALES & MARKETING", "BUSINESS SOLUTIONS MANAGER", "wns"],
      ["", "", "", "", "", "", ""],
      ["2", "CONTOH DUA", "DUA", "PEREMPUAN", "HUMAN RESOURCES & GENERAL AFFAIR", "GENERAL AFFAIR", "WNS"],
      ["3", "contoh  satu", "", "", "", "", ""],
    ] },
  ];

  it("reads the sheet with the Nama karyawan header, tidied, without gender, skipping blanks and repeats", () => {
    const parsed = employeesFromSheets(sheets);
    expect(parsed.sheet).toBe("Data");
    expect(parsed.rows).toEqual([
      { full_name: "Contoh Satu", nickname: "Satu", department: "Sales & Marketing", position: "Business Solutions Manager", office: "WNS", category: "karyawan" },
      { full_name: "Contoh Dua", nickname: "Dua", department: "Human Resources & General Affair", position: "General Affair", office: "WNS", category: "ga" },
    ]);
    expect(parsed.skipped).toEqual(["Contoh Satu tercantum dua kali; baris kedua dilewati."]);
    expect(JSON.stringify(parsed.rows)).not.toMatch(/LAKI|PEREMPUAN/i);
  });

  it("finds nothing in a workbook without such a sheet", () => {
    expect(employeesFromSheets([sheets[0]]).rows).toEqual([]);
  });
});

describe("compareImport", () => {
  const known: Employee = { id: "e1", full_name: "Contoh Satu", nickname: "Satu", department: "Sales & Marketing", position: "Business Solutions Manager", office: "WNS", category: "ga", phone: "0812", email: "", active: true, nip: "", business_unit: "Werkudara Nirwana Sakti" };
  const row = { full_name: "Contoh Satu", nickname: "Satu", department: "Sales & Marketing", position: "Business Solutions Manager", office: "WNS", category: "karyawan" as const };

  it("matches people by name, names what changed, and ignores the category the admin set", () => {
    expect(compareImport([row], [known])).toEqual([{ row, change: "sama", changed: [] }]);
    expect(compareImport([{ ...row, full_name: "CONTOH  SATU", position: "Commercial Manager" }], [known])[0]).toMatchObject({ change: "berubah", changed: ["full_name", "position"] });
    expect(compareImport([{ ...row, full_name: "Contoh Tiga" }], [known])[0].change).toBe("baru");
  });
});

describe("email from the sheet", () => {
  const sheet = { name: "Karyawan", rows: [
    ["NO", "NAMA KARYAWAN", "NAMA PANGGILAN", "DEPARTMENT", "POSITION", "OFFICE", "EMAIL"],
    ["1", "CONTOH SATU", "SATU", "BAS", "STAFF", "WNS", " Satu@Werkudara.com "],
    ["2", "CONTOH DUA", "DUA", "BAS", "STAFF", "WNS", "bukan email"],
  ] };
  it("reads a valid email in lower case and leaves out one that is not", () => {
    const rows = employeesFromSheets([sheet]).rows;
    expect(rows[0].email).toBe("satu@werkudara.com");
    expect(rows[1]).not.toHaveProperty("email");
  });
  it("only fills an empty email", () => {
    const known: Employee = { id: "e1", full_name: "Contoh Satu", nickname: "Satu", department: "BAS", position: "Staff", office: "WNS", category: "karyawan", phone: "", email: "", active: true, nip: "", business_unit: "Werkudara Nirwana Sakti" };
    const row = { full_name: "Contoh Satu", nickname: "Satu", department: "BAS", position: "Staff", office: "WNS", category: "karyawan" as const, email: "satu@werkudara.com" };
    expect(compareImport([row], [known])[0]).toMatchObject({ change: "berubah", changed: ["email"] });
    expect(compareImport([row], [{ ...known, email: "lain@werkudara.com" }])[0].change).toBe("sama");
  });
});

describe("NIP from the sheet", () => {
  it("reads a NIP column and fills only an empty one", () => {
    const rows = employeesFromSheets([{ name: "Karyawan", rows: [["NAMA KARYAWAN", "DEPARTMENT", "NIP"], ["CONTOH SATU", "BAS", " 2026.001 "], ["CONTOH DUA", "BAS", ""]] }]).rows;
    expect(rows[0].nip).toBe("2026.001");
    expect(rows[1]).not.toHaveProperty("nip");
    const known: Employee = { id: "e1", full_name: "Contoh Satu", nickname: "", department: rows[0].department, position: "", office: "", category: "karyawan", phone: "", email: "", active: true, nip: "", business_unit: "Werkudara Nirwana Sakti" };
    expect(compareImport([rows[0]], [known])[0].changed).toEqual(["nip"]);
    expect(compareImport([rows[0]], [{ ...known, nip: "lama" }])[0].change).toBe("sama");
  });
});
