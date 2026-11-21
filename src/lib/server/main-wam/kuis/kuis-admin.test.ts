import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsOf, fake, newRequest, type Query } from "../fake-db.test-helper";

/* Admin WAM → Main WAM → Kuis live on the server: a game freezes the questions in play order and ends the one before; the big screen's key is never kept; results rank by the game's rules. */

vi.mock("server-only", () => ({}));
vi.mock("react", async original => (await import("../fake-db.test-helper")).reactMock(original as () => Promise<typeof import("react")>));
vi.mock("../../supabase/admin", async () => (await import("../fake-db.test-helper")).supabaseMock());
vi.mock("../settings", () => ({ readMainWamSettings: async () => ({ modules: { kuis: true } }) }));

const admin = await import("./admin");
const { hashScreenKey } = await import("./screen");
const QUIZ = "00000000-0000-4000-a000-0000000000aa";
const RUN = "00000000-0000-4000-a000-000000000001";
const has = (q: Query, name: string) => q.calls.some(call => call[0] === name);

beforeEach(() => { newRequest(false); });

describe("a new game", () => {
  it("freezes the questions easy to very hard, ends the game not over, and numbers itself", async () => {
    fake.answer = q => {
      if (q.table === "mw_quiz_questions") return { data: [
        { id: "q3", level: 3, sort: 0, body: "Tiga?", options: ["a", "b", "c", "d"], correct: 2, created_at: "2026-11-20T01:00:00Z" },
        { id: "q1", level: 1, sort: 1, body: "Satu b?", options: ["a", "b", "c", "d"], correct: 0, created_at: "2026-11-20T01:00:00Z" },
        { id: "q0", level: 1, sort: 0, body: "Satu a?", options: ["a", "b", "c", "d"], correct: 1, created_at: "2026-11-20T01:00:00Z" },
      ] };
      if (q.table === "mw_quiz_runs" && has(q, "select") && has(q, "order")) return { data: [{ number: 2 }] };
      if (q.table === "mw_quiz_runs" && has(q, "insert")) return { data: [{ id: RUN, number: 3 }] };
      return { data: [] };
    };
    expect(await admin.newRun(QUIZ, "Admin Contoh")).toEqual({ id: RUN, number: 3 });
    const ended = fake.queries.find(q => q.table === "mw_quiz_runs" && has(q, "update"))!;
    expect(callsOf(ended, "update")[0][0]).toMatchObject({ phase: "selesai" });
    expect(callsOf(ended, "neq")).toEqual([["phase", "selesai"]]);
    const made = fake.queries.find(q => q.table === "mw_quiz_runs" && has(q, "insert"))!;
    const row = callsOf(made, "insert")[0][0] as { number: number; questions: { id: string }[] };
    expect(row.number).toBe(3);
    expect(row.questions.map(question => question.id)).toEqual(["q0", "q1", "q3"]);
  });

  it("needs a question first", async () => {
    fake.answer = () => ({ data: [] });
    await expect(admin.newRun(QUIZ, "Admin")).rejects.toMatchObject({ status: 422 });
  });
});

describe("the big screen's link", () => {
  it("keeps only the hash and the last four characters, and gives the address once", async () => {
    fake.answer = () => ({ data: [{ id: QUIZ }] });
    const link = await admin.newScreenLink(QUIZ);
    expect(link.path).toMatch(/^\/kuis\/kuis_[A-Za-z0-9_-]{43}$/);
    const saved = callsOf(fake.queries[0], "update")[0][0] as { screen_key_hash: string; screen_key_hint: string };
    const key = link.path.split("/").pop()!;
    expect(saved).toMatchObject({ screen_key_hash: hashScreenKey(key), screen_key_hint: key.slice(-4) });
    expect(JSON.stringify(saved)).not.toContain(key);
  });
});

describe("results", () => {
  it("rank by total, then the total time of right answers, with names (admin only)", async () => {
    const tally = (id: string, total: number, ms: number) => ({ employee_id: id, alias: `Tokoh ${id}`, figure_key: null, persona: "", colors: null, mystery_no: 1, joined_at: "2026-11-20T01:00:00Z", total, correct: 2, correct_ms: ms, last_correct_at: null, prev_total: 0, prev_correct_ms: 0, prev_last_correct_at: null });
    const a = "33333333-3333-4333-8333-333333333331", b = "33333333-3333-4333-8333-333333333332";
    fake.answer = q => {
      if (q.table === "mw_quiz_runs") return { data: [{ id: RUN, quiz_id: QUIZ, number: 1, phase: "selesai", question_index: 0, questions: [{ id: "q", level: 1, body: "Satu?", options: ["a", "b", "c", "d"], correct: 0 }], phase_at: "2026-11-20T01:00:00Z", pauses: [], canceled: [], boards: [], podium_revealed: 3, rev: 9, ended_at: null, created_at: "2026-11-20T01:00:00Z", mw_quizzes: { title: "Kuis" }, mw_quiz_players: [{ count: 2 }] }] };
      if (q.table === "rpc:mw_quiz_board") return { data: [tally(a, 800, 9000), tally(b, 800, 4000)] };
      if (q.table === "mw_quiz_players") return { data: [{ employee_id: a, employees: { full_name: "Contoh Satu", department: "CoE" } }, { employee_id: b, employees: { full_name: "Contoh Dua", department: "HR" } }] };
      return { data: [] };
    };
    const results = await admin.runResults(QUIZ, RUN);
    expect(results.rows.map(row => [row.rank, row.fullName, row.total])).toEqual([[1, "Contoh Dua", 800], [2, "Contoh Satu", 800]]);
    expect(results.questions).toEqual([{ index: 0, level: 1, body: "Satu?", answered: 0, correct: 0, canceled: false }]);
    const file = await admin.resultsXlsx(QUIZ, RUN);
    expect(file.name).toBe("hasil-Kuis-permainan-1.xlsx");
    expect(file.file.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("tying a game to an agenda", () => {
  const SESSION = "00000000-0000-4000-a000-0000000000bb";
  it("answers 409 (try again) when the database says another quiz holds the agenda at that moment", async () => {
    const { setQuizAgenda } = await import("./agenda");
    fake.answer = q => {
      if (q.table === "mw_sessions") return { data: { id: SESSION } };
      if (q.table === "mw_quizzes" && callsOf(q, "update").some(call => (call[0] as { session_id?: string | null }).session_id === SESSION)) return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      return { data: [{ id: QUIZ }] };
    };
    await expect(setQuizAgenda(QUIZ, SESSION)).rejects.toMatchObject({ status: 409 });
  });
});
