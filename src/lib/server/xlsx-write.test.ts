import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readXlsx } = await import("./xlsx");
const { sheetNames, writeXlsx } = await import("./xlsx-write");

describe("the .xlsx writer", () => {
  it("writes sheets that the reader gets back cell for cell", () => {
    const file = writeXlsx([
      { name: "Info", rows: [["Ekspor", "Kuesioner"], [], ["Bagian", "Isi"]] },
      { name: "Tentang kamu", rows: [["Nama", "Lagu"], ["Ayu & Budi", "<Bohemian> \"Rhapsody\""], ["Citra", "Lagu dengan\nbaris baru"]] },
    ]);
    expect(file.subarray(0, 2).toString()).toBe("PK");
    expect(readXlsx(file)).toEqual([
      { name: "Info", rows: [["Ekspor", "Kuesioner"], [], ["Bagian", "Isi"]] },
      { name: "Tentang kamu", rows: [["Nama", "Lagu"], ["Ayu & Budi", "<Bohemian> \"Rhapsody\""], ["Citra", "Lagu dengan\nbaris baru"]] },
    ]);
  });
  it("keeps an answer that looks like a formula as text, and drops characters Excel refuses", () => {
    const file = writeXlsx([{ name: "A", rows: [["x"], ["=HYPERLINK(\"http://contoh.invalid\")", "bel\u0007l"]] }]);
    expect(readXlsx(file)[0].rows[1]).toEqual(["=HYPERLINK(\"http://contoh.invalid\")", "bell"]);
  });
  it("makes sheet names valid and unique", () => {
    expect(sheetNames(["Bagian: A/B", "bagian  a b", "", "x".repeat(40), "x".repeat(40)])).toEqual([
      "Bagian A B", "bagian a b (2)", "Lembar", "x".repeat(31), `${"x".repeat(27)} (2)`,
    ]);
  });
});
