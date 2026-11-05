import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QQuestion } from "@/lib/pra-wam/questionnaire";

/* Room pairing against a small in-memory stand-in for Supabase. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let mode: { kind: "select" } | { kind: "insert"; rows: Row[] } | { kind: "upsert"; row: Row } | { kind: "update"; values: Row } | { kind: "delete" } = { kind: "select" };
  let single = false;
  const rows = () => (db[table] ??= []);
  const run = () => {
    if (mode.kind === "insert") { rows().push(...mode.rows); return { data: null, error: null }; }
    if (mode.kind === "upsert") {
      const row = mode.row;
      const at = rows().findIndex(item => item.form_id === row.form_id && item.employee_id === row.employee_id);
      if (at >= 0) rows()[at] = row; else rows().push(row);
      return { data: null, error: null };
    }
    const found = rows().filter(row => filters.every(test => test(row)));
    if (mode.kind === "update") { for (const row of found) Object.assign(row, mode.values); return { data: null, error: null }; }
    if (mode.kind === "delete") { db[table] = rows().filter(row => !found.includes(row)); return { data: null, error: null }; }
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const builder = {
    select: () => builder, order: () => builder, range: () => builder, limit: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
    maybeSingle: () => { single = true; return builder; },
    insert: (value: Row | Row[]) => { mode = { kind: "insert", rows: Array.isArray(value) ? value : [value] }; return builder; },
    upsert: (row: Row) => { mode = { kind: "upsert", row }; return builder; },
    update: (values: Row) => { mode = { kind: "update", values }; return builder; },
    delete: () => { mode = { kind: "delete" }; return builder; },
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
    { id: "p3", name: "Citra Dewi", department: "HR", active: true },
    { id: "p4", name: "Dewi Ayu", department: "IT", active: true },
  ],
}));
const question = (id: string, key: string) => ({ id, key, sectionId: "a", visibility: "hr", kind: "single" }) as QQuestion;
vi.mock("./questionnaire", () => ({
  questionnaireMissing: () => false,
  questionnaireWaiting: () => new Error("waiting"),
  currentForm: async () => ({ id: "f1", status: "buka" }),
  formContent: async () => ({ sections: [], questions: [question("q33", "33"), question("q11", "11"), question("q16", "16")] }),
}));

const { myRoom, placePerson, stayBoard, suggestPlacements } = await import("./stay");
const unlock = { formId: "f1", expiresAt: "", actor: { id: "hr", name: "Orang HR" } };
const answer = (employee_id: string, question_id: string, value: unknown) => ({ form_id: "f1", employee_id, question_id, value });

beforeEach(() => {
  db = {
    cq_forms: [{ id: "f1", rooms_published_at: null }],
    cq_answers: [
      answer("p1", "q33", "Perempuan"), answer("p2", "q33", "Laki-laki"), answer("p3", "q33", "Perempuan"),
      answer("p1", "q11", "Saya merokok"), answer("p3", "q11", "Tidak merokok, keberatan"), answer("p3", "q16", "rahasia kesehatan"),
    ],
    cq_stay_rooms: [{ id: "r1", form_id: "f1", name: "208", kind: "Twin bed", capacity: 2, reviewed_at: "2026-11-05T00:00:00Z", sort: 1 }],
    cq_stay_members: [],
  };
});

describe("placing by hand", () => {
  it("refuses the other room group and a full room, and allows other clashes with a note", async () => {
    await placePerson(unlock, "p1", "r1");
    await expect(placePerson(unlock, "p2", "r1")).rejects.toThrow("berbeda isian pembagian kamar");
    await placePerson(unlock, "p3", "r1");
    expect(db.cq_stay_members.map(row => row.employee_id)).toEqual(["p1", "p3"]);
    expect(db.cq_stay_members[1]).toMatchObject({ placed_by: "hr", room_id: "r1" });
    await expect(placePerson(unlock, "p4", "r1")).rejects.toThrow("Kamar 208 sudah penuh.");
    const board = await stayBoard(unlock);
    expect(board.rooms[0].blocked).toEqual(["Ayu merokok, Citra keberatan dengan rokok."]);
    expect(board.rooms[0].reviewed).toBe(false);
    expect(JSON.stringify(board)).not.toContain("rahasia kesehatan");
    expect(board.waiting.map(card => card.id)).toEqual(["p2"]);
    expect(board.unanswered).toBe(1);
  });
  it("takes someone out of a room", async () => {
    await placePerson(unlock, "p1", "r1");
    await placePerson(unlock, "p1", null);
    expect(db.cq_stay_members).toEqual([]);
  });
});

describe("the suggestion", () => {
  it("fills free beds by the rules, marked as automatic", async () => {
    db.cq_answers = db.cq_answers.filter(row => row.question_id !== "q11");
    expect(await suggestPlacements(unlock)).toBe(2);
    expect(db.cq_stay_members.map(row => row.employee_id).sort()).toEqual(["p1", "p3"]);
    expect(db.cq_stay_members.every(row => row.placed_by === null)).toBe(true);
  });
});

describe("a participant's own room", () => {
  it("is nothing until published, then names roommates and nothing else", async () => {
    await placePerson(unlock, "p1", "r1");
    await placePerson(unlock, "p3", "r1");
    expect(await myRoom("p1")).toBeNull();
    db.cq_forms[0].rooms_published_at = "2026-11-05T08:00:00Z";
    expect(await myRoom("p1")).toEqual({ name: "208", kind: "Twin bed", roommates: [{ name: "Citra Dewi", department: "HR" }] });
    expect(await myRoom("p2")).toBeNull();
  });
});
