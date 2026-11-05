import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QQuestion, QSection } from "@/lib/pra-wam/questionnaire";
import { adminReader, SHARE_CHOICES } from "@/lib/pra-wam/recap";

/* Rekap and Ekspor against a small in-memory stand-in for Supabase; it notes which questions were asked for. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let asked: { table: string; ids: unknown[] }[];
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let head = false;
  const run = () => {
    const found = (db[table] ?? []).filter(row => filters.every(test => test(row)));
    return head ? { data: null, count: found.length, error: null } : { data: found, error: null };
  };
  const builder = {
    select: (_columns: string, options?: { head?: boolean }) => { head = !!options?.head; return builder; },
    order: () => builder, range: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { asked.push({ table, ids: values }); filters.push(row => values.includes(row[key])); return builder; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("server-only", () => ({}));
vi.mock("./appraisal", () => ({
  listPeople: async () => [
    { id: "p1", name: "Ayu Lestari", department: "Comms", active: true },
    { id: "p2", name: "Budi Santoso", department: "Finance", active: true },
    { id: "p3", name: "Citra Dewi", department: "Comms", active: true },
  ],
}));
const section = (id: string, sort: number, extra: Partial<QSection> = {}): QSection => ({ id, key: id.toUpperCase(), title: `Bagian ${id}`, short: id, hello: "", intro: "", tease: "", anonymous: false, sort, hidden: false, ...extra });
const question = (id: string, sectionId: string, sort: number, visibility: QQuestion["visibility"], extra: Partial<QQuestion> = {}) => ({
  id, sectionId, key: id, prompt: `Tanya ${id}`, kind: "single", required: false, visibility, options: ["Ya", "Tidak"], maxChoices: null, matrixRows: [], scale: [],
  placeholder: "", note: "", react: "", showIf: null, sort, hidden: false, ...extra,
}) as QQuestion;
vi.mock("./questionnaire", () => ({
  questionnaireMissing: () => false,
  questionnaireWaiting: () => new Error("waiting"),
  formContent: async () => ({
    sections: [section("a", 1), section("c", 2), section("d", 3, { anonymous: true }), section("gone", 4, { hidden: true })],
    questions: [
      question("song", "a", 1, "rekan", { kind: "text" }),
      question("smoke", "a", 2, "hr"),
      question("phone", "a", 3, "hr", { kind: "text" }),
      question("health", "a", 4, "hronly", { kind: "long" }),
      question("dream", "c", 1, "pilih", { kind: "long" }),
      question("share", "c", 2, "hr", { options: Object.values(SHARE_CHOICES) }),
      question("heard", "d", 1, "anon", { options: ["Jarang", "Sering"] }),
      question("hidden", "gone", 1, "fasil"),
    ],
  }),
}));

const { exportPlan, exportWorkbook, recapOf } = await import("./recap");
const { readXlsx } = await import("../xlsx");

const form = { id: "f1", name: "Kuesioner" };
const answer = (employee_id: string, question_id: string, value: unknown) => ({ form_id: "f1", employee_id, question_id, value });

beforeEach(() => {
  asked = [];
  db = {
    cq_answers: [
      answer("p1", "song", "Lagu A"), answer("p1", "smoke", "Tidak"), answer("p1", "phone", "0800-0000-0001"), answer("p1", "health", "rahasia Ayu"),
      answer("p1", "dream", "mimpi Ayu"), answer("p1", "share", SHARE_CHOICES.named),
      answer("p2", "song", "Lagu B"), answer("p2", "smoke", "Ya"), answer("p2", "dream", "mimpi Budi"), answer("p2", "share", SHARE_CHOICES.unnamed),
      answer("p3", "dream", "mimpi Citra"),
    ],
    cq_anon_answers: ["Jarang", "Sering", "Sering", "Sering"].map((value, index) => ({ id: `a${index}`, form_id: "f1", question_id: "heard", value })),
    cq_anon_receipts: ["p1", "p2", "p3", "p4"].map(employee_id => ({ form_id: "f1", employee_id })),
  };
});

describe("Rekap", () => {
  it("never fetches what Data HR keeps locked, and shows HR choices as counts", async () => {
    const recap = await recapOf(form, adminReader(false));
    const fetched = asked.filter(call => call.table === "cq_answers").flatMap(call => call.ids);
    expect(fetched).not.toContain("health");
    expect(fetched).not.toContain("phone");
    const text = JSON.stringify(recap);
    for (const secret of ["rahasia Ayu", "0800-0000-0001", "Ayu Lestari", "Budi Santoso"]) expect(text).not.toContain(secret);
    const items = Object.fromEntries(recap.sections.flatMap(item => item.items).map(item => [item.key, item]));
    expect(items.smoke.body).toEqual({ type: "bars", rest: 0, bars: [{ label: "Ya", count: 1 }, { label: "Tidak", count: 1 }] });
    expect(items.health.body.type).toBe("needs-hr");
    expect(items.phone.body.type).toBe("needs-hr");
    expect(recap.sections.map(item => item.key)).toEqual(["A", "C", "D"]);
  });
  it("opens HR answers once Data HR is open", async () => {
    const recap = await recapOf(form, adminReader(true));
    const health = recap.sections[0].items.find(item => item.key === "health");
    expect(health?.body).toEqual({ type: "quotes", quotes: [{ text: "rahasia Ayu", count: 1 }] });
  });
  it("shows the anonymous section only from five answers, and never per department", async () => {
    let recap = await recapOf(form, adminReader(false));
    expect(recap.sections[2].items[0].body).toEqual({ type: "few" });
    db.cq_anon_answers.push({ id: "a9", form_id: "f1", question_id: "heard", value: "Jarang" });
    recap = await recapOf(form, adminReader(false));
    expect(recap.sections[2].items[0].body).toEqual({ type: "bars", rest: 0, bars: [{ label: "Jarang", count: 2 }, { label: "Sering", count: 3 }] });
    recap = await recapOf(form, adminReader(false), "Comms");
    expect(recap.sections[2]).toMatchObject({ notSplit: true, items: [] });
  });
  it("narrows to one department and holds back HR counts that small", async () => {
    const recap = await recapOf(form, adminReader(false), "Comms");
    expect(recap.department).toBe("Comms");
    expect(recap.respondents).toBe(2);
    const items = Object.fromEntries(recap.sections[0].items.map(item => [item.key, item]));
    expect(items.song.body).toEqual({ type: "quotes", quotes: [{ text: "Lagu A", count: 1 }] });
    expect(items.smoke.body).toEqual({ type: "few" });
    expect((await recapOf(form, adminReader(false), "Tidak ada")).department).toBeNull();
  });
});

describe("Ekspor", () => {
  const sheets = async (hrOpen: boolean, only: string | null = null) => {
    const result = await exportWorkbook(form, adminReader(hrOpen), only, new Date("2026-11-05T03:00:00Z"));
    return { ...result, book: Object.fromEntries(readXlsx(result.file).map(sheet => [sheet.name, sheet.rows])) };
  };
  it("leaves HR columns out while Data HR is locked, and says so", async () => {
    const { book, includesHr } = await sheets(false);
    expect(includesHr).toBe(false);
    expect(book["Bagian a"]).toEqual([["Nama", "Departemen", "song. Tanya song"], ["Ayu Lestari", "Comms", "Lagu A"], ["Budi Santoso", "Finance", "Lagu B"]]);
    expect(JSON.stringify(book)).not.toContain("rahasia Ayu");
    expect(JSON.stringify(book)).not.toContain("0800-0000-0001");
    expect(book.Info.find(row => row[0] === "Data HR")?.[1]).toContain("Tidak ikut");
    expect(book["Bagian gone"]).toBeUndefined();
  });
  it("puts HR columns in once Data HR is open, and reports it so the route logs it", async () => {
    const { book, includesHr } = await sheets(true);
    expect(includesHr).toBe(true);
    expect(book["Bagian a"][0]).toEqual(["Nama", "Departemen", "song. Tanya song", "smoke. Tanya smoke", "phone. Tanya phone", "health. Tanya health"]);
    expect(book["Bagian a"][1]).toEqual(["Ayu Lestari", "Comms", "Lagu A", "Tidak", "0800-0000-0001", "rahasia Ayu"]);
  });
  it("keeps the names of people who did not choose to be named off their pilih answers", async () => {
    const { book } = await sheets(false);
    expect(book["Bagian c"]).toEqual([["Nama", "Departemen", "dream. Tanya dream"], ["Ayu Lestari", "Comms", "mimpi Ayu"]]);
    expect(book["Bagian c tanpa nama"][0]).toEqual(["dream. Tanya dream"]);
    expect(book["Bagian c tanpa nama"].slice(1).flat().sort()).toEqual(["mimpi Budi", "mimpi Citra"]);
  });
  it("exports the anonymous section without people, only from five sends", async () => {
    let { book } = await sheets(false, "D");
    expect(book["Bagian d"]).toBeUndefined();
    expect(book.Info.find(row => row[0] === "Bagian d")?.[1]).toContain("baru 4 kiriman");
    db.cq_anon_receipts.push({ form_id: "f1", employee_id: "p5" });
    ({ book } = await sheets(false, "D"));
    expect(book["Bagian d"][0]).toEqual(["Pertanyaan", "Jawaban"]);
    expect(book["Bagian d"].slice(1).map(row => row[1]).sort()).toEqual(["Jarang", "Sering", "Sering", "Sering"]);
    expect(Object.keys(book)).toEqual(["Info", "Bagian d"]);
  });
  it("refuses a section that is not there, and plans without reading answers", async () => {
    await expect(exportWorkbook(form, adminReader(false), "ZZ")).rejects.toThrow("Bagian ini tidak ada");
    asked = [];
    expect((await exportPlan(form, adminReader(false)))[0]).toEqual({ key: "A", title: "Bagian a", anonymous: false, total: 4, columns: 1, needsHr: 3 });
    expect(asked).toEqual([]);
  });
});
