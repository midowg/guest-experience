import "server-only";
import type { QQuestion } from "@/lib/pra-wam/questionnaire";
import type { Cell, SheetOut } from "../xlsx-write";
import type { AnswerTable } from "./answer-table";

/*
 * Data makanan (19 Nov 2026, the owner's request): the questionnaire's food answers in their own
 * Excel file, for the catering, from Rekap's table (so the same people and the same rules: HR
 * answers in, the download logged). One row per person, and a summary of how many people need what.
 */

/** The food questions, by their fixed keys (questions.json): needs, what to avoid, favourite food, snacks and drinks. */
export const FOOD_KEYS = ["14", "14a", "21b", "21c"] as const;
const LABELS: Record<(typeof FOOD_KEYS)[number], string> = {
  "14": "Kebutuhan atau batasan makanan", "14a": "Alergi atau makanan yang dihindari", "21b": "Makanan atau camilan favorit", "21c": "Camilan dan minuman favorit",
};
const NONE = "Tidak ada";

/** A cell's choices: Rekap joins them with ", "; a written-in "Lainnya: …" may hold commas of its own. */
function choices(cell: string, options: readonly string[]): string[] {
  const parts = cell.split(", ");
  const known = options.filter(option => parts.includes(option) || (option === "Lainnya" && parts.some(part => part.startsWith("Lainnya:"))));
  return known;
}

/**
 * The sheets: "Makanan" (everyone who answered a food question, A to Z) and "Ringkasan" (per
 * dietary need: how many and who; per snack or drink: how many). `questions` gives the options.
 */
export function foodSheets(table: AnswerTable, questions: Pick<QQuestion, "key" | "options">[], now = new Date(), formName = table.formName): { sheets: SheetOut[]; people: number } {
  const present = FOOD_KEYS.filter(key => table.columns.some(column => column.key === key));
  const rows = table.rows.filter(row => present.some(key => (row.cells[key] ?? "").trim()))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  const optionsOf = (key: string) => questions.find(question => question.key === key)?.options ?? [];

  const data: SheetOut = {
    name: "Makanan",
    rows: [["Nama", "Departemen", ...present.map(key => LABELS[key])], ...rows.map(row => [row.name, row.department, ...present.map(key => row.cells[key] ?? "")])],
    widths: [28, 24, ...present.map(key => (key === "14a" || key === "21b" ? 48 : 36))],
  };

  const summary: Cell[][] = [["Ringkasan", `${rows.length} orang menjawab pertanyaan makanan`], []];
  if (present.includes("14")) {
    summary.push(["Kebutuhan atau batasan makanan", "Jumlah orang", "Siapa"]);
    for (const option of optionsOf("14")) {
      const who = rows.filter(row => choices(row.cells["14"] ?? "", optionsOf("14")).includes(option));
      if (option === NONE) { summary.push([option, who.length, ""]); continue; }
      summary.push([option, who.length, who.map(row => row.name).join(", ")]);
    }
    const unanswered = rows.filter(row => !(row.cells["14"] ?? "").trim()).length;
    if (unanswered) summary.push(["Belum menjawab pertanyaan ini", unanswered, ""]);
    summary.push([]);
  }
  if (present.includes("14a")) {
    const told = rows.filter(row => (row.cells["14a"] ?? "").trim());
    summary.push(["Alergi atau makanan yang dihindari", "Jumlah orang", "Siapa dan apa"]);
    summary.push(["Menuliskan alergi atau pantangan", told.length, told.map(row => `${row.name}: ${row.cells["14a"]}`).join("; ")]);
    summary.push([]);
  }
  if (present.includes("21c")) {
    summary.push(["Camilan dan minuman favorit", "Jumlah orang"]);
    const counted = optionsOf("21c").map(option => [option, rows.filter(row => choices(row.cells["21c"] ?? "", optionsOf("21c")).includes(option)).length] as [string, number]);
    for (const [option, count] of counted.sort((a, b) => b[1] - a[1])) summary.push([option, count]);
  }

  const stamp = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(now);
  const info: SheetOut = {
    name: "Info", widths: [32, 100],
    rows: [
      ["Data makanan", formName], ["Waktu", `${stamp} WIB`],
      ["Isi", "Jawaban makanan dari kuesioner: kebutuhan atau batasan makanan, alergi atau makanan yang dihindari, makanan favorit, camilan dan minuman favorit."],
      ["Rahasia", "Kebutuhan makanan dan alergi adalah data HR. Bagikan hanya ke tim katering yang perlu, dan hapus bila sudah tidak dipakai."],
    ],
  };
  return { sheets: [info, data, { name: "Ringkasan", rows: summary, widths: [40, 16, 90] }], people: rows.length };
}
