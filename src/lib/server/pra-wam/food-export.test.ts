import { expect, it, vi } from "vitest";
import type { AnswerTable } from "./answer-table";

vi.mock("server-only", () => ({}));
const { foodSheets } = await import("./food-export");

/* Data makanan (19 Nov 2026): the food answers alone, one row per person, and a summary for the catering. */

const column = (key: string, prompt: string, visibility: "hr" | "rekan" | "fasil") => ({ key, number: 1, prompt, section: "A", sectionId: "s1", visibility });
const row = (name: string, cells: Record<string, string>) => ({ id: name, name, department: "Creative", state: "selesai" as const, sectionsDone: 6, sectionsTotal: 6, lastActivity: null, cells });
const table: AnswerTable = {
  formName: "Cerita Kita", sections: [], counts: { selesai: 3, sedang: 0, belum: 1 }, outside: 0,
  columns: [column("1", "Nama panggilan", "rekan"), column("14", "Ada kebutuhan atau batasan makanan?", "hr"), column("14a", "Alergi?", "hr"), column("21b", "Makanan favorit?", "rekan"), column("21c", "Camilan?", "fasil")],
  rows: [
    row("Sinta", { "1": "Sinta", "14": "Vegetarian, Lainnya: tanpa bawang, ya", "21c": "Teh, Kopi" }),
    row("Bayu", { "1": "Bayu", "14": "Halal, Alergi makanan", "14a": "Udang", "21b": "Bakso", "21c": "Kopi" }),
    row("Dewi", { "1": "Dewi", "14": "Tidak ada", "21c": "Kopi, Buah potong" }),
    row("Raka", { "1": "Raka" }),
  ],
};
const questions = [
  { key: "14", options: ["Tidak ada", "Halal", "Vegetarian", "Vegan", "Alergi makanan", "Ada makanan yang kuhindari", "Lainnya"] },
  { key: "21c", options: ["Kopi", "Teh", "Buah potong", "Yogurt"] },
];

it("puts only the food answers in, for the people who gave any, A to Z", () => {
  const { sheets, people } = foodSheets(table, questions, new Date("2026-11-19T03:00:00Z"));
  expect(sheets.map(sheet => sheet.name)).toEqual(["Info", "Makanan", "Ringkasan"]);
  expect(people).toBe(3);
  const data = sheets[1].rows;
  expect(data[0]).toEqual(["Nama", "Departemen", "Kebutuhan atau batasan makanan", "Alergi atau makanan yang dihindari", "Makanan atau camilan favorit", "Camilan dan minuman favorit"]);
  // Raka answered nothing about food; the other answers (nama panggilan) never go in.
  expect(data.slice(1).map(line => line[0])).toEqual(["Bayu", "Dewi", "Sinta"]);
  expect(data[1]).toEqual(["Bayu", "Creative", "Halal, Alergi makanan", "Udang", "Bakso", "Kopi"]);
});

it("counts each dietary need with who has it, and each snack, a written-in Lainnya counted once", () => {
  const summary = foodSheets(table, questions).sheets[2].rows;
  const line = (label: string) => summary.find(item => item[0] === label);
  expect(line("Vegetarian")).toEqual(["Vegetarian", 1, "Sinta"]);
  expect(line("Halal")).toEqual(["Halal", 1, "Bayu"]);
  expect(line("Lainnya")).toEqual(["Lainnya", 1, "Sinta"]);
  expect(line("Tidak ada")).toEqual(["Tidak ada", 1, ""]);
  expect(line("Menuliskan alergi atau pantangan")).toEqual(["Menuliskan alergi atau pantangan", 1, "Bayu: Udang"]);
  expect(line("Kopi")).toEqual(["Kopi", 3]);
  expect(line("Yogurt")).toEqual(["Yogurt", 0]);
});
