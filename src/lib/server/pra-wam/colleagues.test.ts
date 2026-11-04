import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QQuestion, QSection } from "@/lib/pra-wam/questionnaire";

/* Rekan against a small in-memory stand-in for Supabase: tables are arrays; eq and in filter. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let single = false;
  const run = () => {
    const found = (db[table] ?? []).filter(row => filters.every(test => test(row)));
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const builder = {
    select: () => builder, order: () => builder, range: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
    maybeSingle: () => { single = true; return builder; },
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
    { id: "p3", name: "Citra Dewi", department: "HR", active: false },
    { id: "p4", name: "Dodi", department: "IT", active: true },
  ],
}));
const section = (id: string, sort: number, extra: Partial<QSection> = {}): QSection => ({ id, key: id, title: id, short: id, hello: "", intro: "", tease: "", anonymous: false, sort, hidden: false, ...extra });
const question = (id: string, sectionId: string, sort: number, visibility: QQuestion["visibility"], extra: Partial<QQuestion> = {}) => ({
  id, sectionId, key: id, prompt: `Tanya ${id}`, kind: "text", required: false, visibility, options: [], maxChoices: null, matrixRows: [], scale: [],
  placeholder: "", note: "", react: "", showIf: null, sort, hidden: false, ...extra,
}) as unknown as QQuestion;
vi.mock("./questionnaire", () => ({
  questionnaireMissing: () => false,
  formContent: async () => ({
    sections: [section("s1", 1), section("s2", 2), section("anon", 3, { anonymous: true }), section("gone", 4, { hidden: true })],
    questions: [
      question("q-rekan", "s1", 2, "rekan"),
      question("q-first", "s1", 1, "rekan", { kind: "multi" }),
      question("q-buddy", "s2", 1, "rekan", { kind: "person" }),
      question("q-fasil", "s1", 3, "fasil"),
      question("q-hr", "s1", 4, "hr"),
      question("q-hronly", "s2", 2, "hronly"),
      question("q-hidden", "s2", 3, "rekan", { hidden: true }),
      question("q-anon", "anon", 1, "rekan"),
      question("q-gone", "gone", 1, "rekan"),
      question("q-empty", "s2", 4, "rekan"),
    ],
  }),
}));

const { colleagueOf, galleryOf, hasNumberedCard } = await import("./colleagues");

const form = { id: "f1" };
const personCard = (employee_id: string, serial: number | null, card_id = "garda") => ({
  form_id: "f1", employee_id, card_id, tier_key: "common", background: 1, accent: 1, stickers: [], serial, trial: serial === null,
  combo: `${employee_id}`, dna: "0123456789", roll: {}, drawn_at: "2026-11-04T10:00:00.000Z",
});

beforeEach(() => {
  db = {
    cq_tiers: [{ form_id: "f1", key: "common", name: "Common", color: "#AEB7C7", odds: 10000, max_cards: null, line: "", sort: 0 }],
    cq_cards: [{ form_id: "f1", id: "garda", number: 1, key: "garda", name: "Happy Rebel", figure: "", class: "Garda", title: "", description: "", powers: [], partner_id: null, hidden: false, image_key: null, image_updated_at: null, cq_card_rules: [] }],
    cq_card_parts: [{ form_id: "f1", kind: "latar", number: 1, name: "L1", image_key: null, image_updated_at: null }, { form_id: "f1", kind: "aksen", number: 1, name: "A1", image_key: null, image_updated_at: null }],
    cq_person_cards: [personCard("p2", 2), personCard("p1", 1), personCard("p3", 3), personCard("p4", null)],
    cq_answers: [
      ...["q-rekan", "q-fasil", "q-hr", "q-hronly", "q-hidden", "q-anon", "q-gone"].map(id => ({ form_id: "f1", employee_id: "p1", question_id: id, value: `jawaban ${id}` })),
      { form_id: "f1", employee_id: "p1", question_id: "q-first", value: ["Musik", "Film"] },
      { form_id: "f1", employee_id: "p1", question_id: "q-buddy", value: "p2" },
      { form_id: "f1", employee_id: "p1", question_id: "q-empty", value: "   " },
      { form_id: "f1", employee_id: "p2", question_id: "q-rekan", value: "punya Budi" },
    ],
  };
});

describe("the gallery", () => {
  it("shows numbered cards of active people only, and never a trial card", async () => {
    const { entries, ready } = await galleryOf(form);
    expect(ready).toBe(true);
    // The stand-in does not sort; the real query orders by number.
    expect(entries.map(entry => entry.employeeId).sort()).toEqual(["p1", "p2"]);
    expect(entries.find(entry => entry.employeeId === "p1")).toMatchObject({ name: "Ayu Lestari", department: "Comms", card: { serial: 1, character: { name: "Happy Rebel" } } });
  });
  it("opens to someone with a numbered card, not to a trial card", async () => {
    expect(await hasNumberedCard(form, "p1")).toBe(true);
    expect(await hasNumberedCard(form, "p4")).toBe(false);
    expect(await hasNumberedCard(form, "nobody")).toBe(false);
  });
});

describe("a colleague's profile", () => {
  it("holds only answers marked for colleagues, in the questionnaire's order, people by name", async () => {
    const profile = await colleagueOf(form, "p1");
    expect(profile?.person).toEqual({ id: "p1", name: "Ayu Lestari", department: "Comms" });
    expect(profile?.answers).toEqual([
      { key: "q-first", prompt: "Tanya q-first", lines: ["Musik", "Film"] },
      { key: "q-rekan", prompt: "Tanya q-rekan", lines: ["jawaban q-rekan"] },
      { key: "q-buddy", prompt: "Tanya q-buddy", lines: ["Budi Santoso"] },
    ]);
    const text = JSON.stringify(profile);
    for (const kept of ["q-fasil", "q-hr", "q-hronly", "q-hidden", "q-anon", "q-gone"]) expect(text).not.toContain(`jawaban ${kept}`);
  });
  it("is not there without a numbered card, or for someone no longer active", async () => {
    expect(await colleagueOf(form, "p4")).toBeNull();
    expect(await colleagueOf(form, "p3")).toBeNull();
    expect(await colleagueOf(form, "nobody")).toBeNull();
  });
});
