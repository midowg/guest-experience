import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerDeleteSchema, deletedText } from "@/lib/pra-wam/answer-delete";

/* Rekap's "Hapus jawaban" against a small in-memory stand-in for Supabase. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let mode: "delete" | "update" = "delete";
  let values: Row = {};
  const run = () => {
    const rows = db[table] ?? [];
    const found = rows.filter(row => filters.every(test => test(row)));
    if (mode === "delete") { db[table] = rows.filter(row => !found.includes(row)); return { data: null, count: found.length, error: null }; }
    for (const row of found) Object.assign(row, values);
    return { data: null, error: null };
  };
  const builder = {
    delete: () => { mode = "delete"; return builder; },
    update: (next: Row) => { mode = "update"; values = next; return builder; },
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    in: (key: string, list: unknown[]) => { filters.push(row => list.includes(row[key])); return builder; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("server-only", () => ({}));
vi.mock("./questionnaire", () => ({ questionnaireMissing: () => false, questionnaireWaiting: () => new Error("waiting") }));

const { deleteAnswers } = await import("./answer-delete");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  db = {
    cq_answers: [{ form_id: "f1", employee_id: A, question_id: "q1" }, { form_id: "f1", employee_id: A, question_id: "q2" }, { form_id: "f1", employee_id: B, question_id: "q1" }, { form_id: "f0", employee_id: A, question_id: "q9" }],
    cq_progress: [{ form_id: "f1", employee_id: A }, { form_id: "f1", employee_id: B }],
    cq_anon_answers: [{ form_id: "f1", question_id: "q7" }, { form_id: "f1", question_id: "q7" }],
    cq_anon_receipts: [{ form_id: "f1", employee_id: A }],
    cq_stay_members: [{ form_id: "f1", employee_id: A }, { form_id: "f1", employee_id: B }],
    cq_forms: [{ id: "f1", rooms_published_at: "2026-11-10T00:00:00Z" }],
  };
});

describe("Hapus jawaban", () => {
  it("deletes the chosen people's named answers and progress, nothing else", async () => {
    const result = await deleteAnswers({ id: "f1" }, { who: "pilih", employeeIds: [A, A] });
    expect(result).toEqual({ people: 1, answers: 2, anonymous: 0, roommates: 0 });
    expect(db.cq_answers.map(row => row.employee_id)).toEqual([B, A]);
    expect(db.cq_answers[1].form_id).toBe("f0");
    expect(db.cq_progress.map(row => row.employee_id)).toEqual([B]);
    // Anonymous answers, their receipt and the rooms stay.
    expect([db.cq_anon_answers.length, db.cq_anon_receipts.length, db.cq_stay_members.length]).toEqual([2, 1, 2]);
    expect(deletedText({ who: "pilih" }, result)).toBe("Jawaban 1 orang dihapus (2 jawaban). Statusnya kembali Belum mulai.");
  });

  it("deletes everything of this questionnaire, anonymous answers and the rooms too, and takes the rooms off Beranda", async () => {
    const result = await deleteAnswers({ id: "f1" }, { who: "semua", confirm: "HAPUS" });
    expect(result).toEqual({ people: 2, answers: 3, anonymous: 2, roommates: 2 });
    expect(db.cq_answers).toEqual([{ form_id: "f0", employee_id: A, question_id: "q9" }]);
    expect([db.cq_progress.length, db.cq_anon_answers.length, db.cq_anon_receipts.length, db.cq_stay_members.length]).toEqual([0, 0, 0, 0]);
    expect(db.cq_forms[0].rooms_published_at).toBeNull();
    expect(deletedText({ who: "semua" }, result)).toBe("Semua data kuesioner dihapus: 3 jawaban bernama, 2 jawaban anonim, dan 2 penempatan kamar.");
  });

  it("asks for people, and for HAPUS typed before everything goes", () => {
    expect(answerDeleteSchema.safeParse({ who: "pilih", employeeIds: [] }).success).toBe(false);
    expect(answerDeleteSchema.safeParse({ who: "pilih", employeeIds: ["bukan-id"] }).success).toBe(false);
    expect(answerDeleteSchema.safeParse({ who: "semua", confirm: "hapus" }).success).toBe(false);
    expect(answerDeleteSchema.safeParse({ who: "semua" }).success).toBe(false);
    expect(answerDeleteSchema.safeParse({ who: "semua", confirm: "HAPUS" }).success).toBe(true);
  });
});
