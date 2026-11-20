import { beforeEach, describe, expect, it, vi } from "vitest";
import { fake, callsOf, newRequest, type Query } from "../fake-db.test-helper";
import { soalTimes } from "@/lib/main-wam/kuis/flow";
import { SAMPLE_QUESTIONS, SAMPLE_T0 } from "@/lib/main-wam/kuis/sample";
import type { MainWamContext } from "../gate";

/*
 * Kuis live on the server (with the stand-in database): what each poll costs, that the key and the
 * scores stay on the server until the answer opens, one answer per question, the MC only for the quiz's
 * pengendali (or Admin WAM), the big screen only with its key while the module is on, names only for
 * the podium's open places.
 */

vi.mock("server-only", () => ({}));
vi.mock("react", async original => (await import("../fake-db.test-helper")).reactMock(original as () => Promise<typeof import("react")>));
// The stand-in database, with the arguments of each rpc kept (the helper records only its name).
const rpcArgs = vi.hoisted(() => ({ calls: [] as [string, unknown][] }));
vi.mock("../../supabase/admin", async () => {
  const helper = await import("../fake-db.test-helper");
  const client = () => { const base = helper.fakeClient(); return { ...base, rpc: (name: string, args: unknown) => { rpcArgs.calls.push([name, args]); return base.rpc(name); } }; };
  return { createPrivilegedClient: client, createPublicClient: client };
});
vi.mock("next/server", () => ({ after: (fn: () => unknown) => { void fn(); } }));
const notes = vi.hoisted(() => ({ sent: [] as unknown[] }));
vi.mock("../notes", () => ({ trySendMainWamNote: async (input: unknown) => { notes.sent.push(input); return 3; } }));
const alias = vi.hoisted(() => ({ value: null as null | { figure: string; alias: string; persona: string; colors: [string, string] } }));
vi.mock("./alias", () => ({ figureAlias: async () => alias.value }));
const settings = vi.hoisted(() => ({ kuis: true }));
vi.mock("../settings", () => ({ readMainWamSettings: async () => ({ modules: { kuis: settings.kuis } }) }));

const { playState, joinGame, answerQuestion } = await import("./play");
const { controlState, controlAct } = await import("./control");
const { screenState, newScreenKey, hashScreenKey } = await import("./screen");

const QUIZ = "00000000-0000-4000-a000-0000000000aa";
const RUN = "00000000-0000-4000-a000-000000000001";
const ME = "11111111-1111-4111-8111-111111111111";
const context = (roles: string[] = []) => ({ viewer: { id: ME, name: "Rani", roles }, settings: { modules: { kuis: true } } }) as unknown as MainWamContext;
/** The apps of ME's admin grant (20 Nov 2026: Admin WAM 2026, wam_acara, runs every quiz). */
let grantApps: string[] = [];
/** ME holding Admin WAM 2026 on their WAM account. */
const asWamAdmin = () => { grantApps = ["wam_acara"]; return context(); };

type RunPatch = Partial<{ phase: string; question_index: number; phase_at: string; pauses: unknown[]; rev: number; podium_revealed: number; boards: number[] }>;
let run: RunPatch & Record<string, unknown>;
const runRow = () => ({
  id: RUN, quiz_id: QUIZ, number: 1, phase: "soal", question_index: 2, questions: SAMPLE_QUESTIONS, phase_at: new Date(SAMPLE_T0).toISOString(), pauses: [],
  canceled: [], boards: [], podium_revealed: 0, rev: 5, ended_at: null, ...run,
});
const tables = () => fake.queries.map(q => q.table);
const has = (q: Query, name: string) => q.calls.some(call => call[0] === name);

let answer: (q: Query) => { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };
beforeEach(() => {
  newRequest(false);
  run = {};
  notes.sent = [];
  rpcArgs.calls = [];
  alias.value = null;
  settings.kuis = true;
  grantApps = [];
  answer = q => {
    switch (q.table) {
      case "mw_quizzes": return { data: [{ id: QUIZ, title: "Kuis WAM", mw_quiz_runs: [runRow()] }] };
      case "mw_quiz_players":
        if (has(q, "maybeSingle")) return { data: [{ alias: "Marie Curie", figure_key: "marie-curie", persona: "Ahli Siasat", colors: ["#3A6FBF", "#1B2C66"], mystery_no: null, joined_at: new Date(SAMPLE_T0).toISOString(), mw_quiz_answers: [
          { employee_id: ME, question_index: 2, choice: 0, ms: 4_000, correct: true, points: 460, tapped_at: new Date(SAMPLE_T0 + 7_000).toISOString() },
        ] }] };
        return { data: [], count: 12 };
      case "mw_quiz_answers": return { data: [], count: 7 };
      case "mw_quiz_hosts": return { data: [] };
      case "admin_grants": return { data: grantApps.length ? [{ apps: grantApps }] : [] };
      case "rpc:mw_quiz_board": return { data: [] };
      case "rpc:mw_quiz_join": return { data: "ok" };
      case "mw_quiz_runs": return { data: [{ rev: 6 }] };
      default: return { data: [] };
    }
  };
  fake.answer = q => answer(q);
});

const times = soalTimes(SAMPLE_QUESTIONS[2].level);

describe("a phone's poll", () => {
  it("costs one query when nothing changed (on top of the gate), two in the lobby", async () => {
    const now = SAMPLE_T0 + times.open + 5_000;
    const first = await playState(context(), QUIZ, null, now);
    newRequest(false);
    const again = await playState(context(), QUIZ, first.v, now + 1_500);
    expect(again.same).toBe(true);
    expect(tables()).toEqual(["mw_quizzes"]);
    run = { phase: "lobi", question_index: -1 };
    newRequest(false);
    const lobby = await playState(context(), QUIZ, null, now);
    newRequest(false);
    const lobbyAgain = await playState(context(), QUIZ, lobby.v, now);
    expect(lobbyAgain).toMatchObject({ same: true, lobby: { players: 12 } });
    expect(tables()).toEqual(["mw_quizzes", "mw_quiz_players"]);
  });

  it("reads my row and the count, nobody's totals and no key, before the answer opens", async () => {
    const snap = await playState(context(), QUIZ, null, SAMPLE_T0 + times.open + 5_000);
    expect(tables().sort()).toEqual(["mw_quiz_players", "mw_quiz_players", "mw_quizzes"]);
    expect(snap.question?.correct).toBeNull();
    expect(snap.me?.answer).toEqual({ choice: 0, value: 460 });
    expect(snap.me?.result).toBeNull();
    expect(snap.me?.total).toBe(0);
    expect(JSON.stringify(snap)).not.toContain('"points"');
  });

  it("reads everyone's totals and the question's answers once it opens (4 queries)", async () => {
    const snap = await playState(context(), QUIZ, null, SAMPLE_T0 + times.reveal);
    expect(tables().sort()).toEqual(["mw_quiz_answers", "mw_quiz_players", "mw_quizzes", "rpc:mw_quiz_board"]);
    expect(rpcArgs.calls).toEqual([["mw_quiz_board", { p_run: RUN, p_upto: 2, p_prev: 1 }]]);
    expect(snap.question?.correct).toBe(SAMPLE_QUESTIONS[2].correct);
    expect(snap.me?.result).toEqual({ correct: true, points: 460 });
  });

  it("is not found for an unknown quiz, and waits for the migration before it", async () => {
    answer = q => (q.table === "mw_quizzes" ? { data: [] } : { data: [] });
    await expect(playState(context(), QUIZ, null)).rejects.toMatchObject({ status: 404 });
    answer = () => ({ error: { code: "42P01", message: "relation mw_quizzes does not exist" } });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(playState(context(), QUIZ, null)).rejects.toMatchObject({ status: 503, message: "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE." });
  });
});

describe("joining", () => {
  it("joins as my tokoh, or as Tokoh misterius when I have no card", async () => {
    run = { phase: "lobi", question_index: -1 };
    alias.value = { figure: "marie-curie", alias: "Marie Curie", persona: "Ahli Siasat", colors: ["#3A6FBF", "#1B2C66"] };
    await joinGame(context(), QUIZ, RUN);
    expect(rpcArgs.calls.find(([name]) => name === "mw_quiz_join")?.[1]).toEqual({ p_run: RUN, p_employee: ME, p_figure: "marie-curie", p_alias: "Marie Curie", p_persona: "Ahli Siasat", p_colors: ["#3A6FBF", "#1B2C66"] });
    rpcArgs.calls = [];
    alias.value = null;
    await joinGame(context(), QUIZ, RUN);
    expect(rpcArgs.calls.find(([name]) => name === "mw_quiz_join")?.[1]).toMatchObject({ p_figure: null, p_alias: null });
  });

  it("refuses a game that is not open, or a replaced one", async () => {
    run = { phase: "siap", question_index: -1 };
    const answers = answer;
    answer = q => (q.table === "rpc:mw_quiz_join" ? { data: "tutup" } : answers(q));
    await expect(joinGame(context(), QUIZ, RUN)).rejects.toMatchObject({ status: 409, message: "Kuis belum dibuka. Tunggu aba-aba MC." });
    await expect(joinGame(context(), QUIZ, "00000000-0000-4000-a000-000000000002")).rejects.toMatchObject({ status: 409 });
  });
});

describe("an answer", () => {
  const input = (patch: Partial<{ index: number; choice: number; tapAt: number }> = {}) => ({ runId: RUN, index: 2, choice: 0, tapAt: SAMPLE_T0 + times.open + 4_000, ...patch });

  it("is saved with its time and points, and the reply only says the locked value", async () => {
    answer = q => (q.table === "mw_quiz_answers" ? { data: [{ choice: 0, ms: 4_000 }] } : q.table === "mw_quizzes" ? { data: [{ id: QUIZ, title: "Kuis", mw_quiz_runs: [runRow()] }] } : { data: [] });
    const result = await answerQuestion(context(), QUIZ, input(), SAMPLE_T0 + times.open + 4_300);
    expect(result).toEqual({ choice: 0, ms: 4_000, value: 460 });
    expect(result).not.toHaveProperty("correct");
    const saved = fake.queries.find(q => q.table === "mw_quiz_answers")!;
    expect(callsOf(saved, "upsert")[0]).toEqual([
      expect.objectContaining({ run_id: RUN, question_index: 2, employee_id: ME, choice: 0, ms: 4_000, correct: SAMPLE_QUESTIONS[2].correct === 0, points: SAMPLE_QUESTIONS[2].correct === 0 ? 460 : -100 }),
      { onConflict: "run_id,question_index,employee_id", ignoreDuplicates: true },
    ]);
  });

  it("keeps the first answer: a second one gets the first back", async () => {
    let call = 0;
    answer = q => {
      if (q.table === "mw_quizzes") return { data: [{ id: QUIZ, title: "Kuis", mw_quiz_runs: [runRow()] }] };
      if (q.table === "mw_quiz_answers") return call++ === 0 ? { data: [] } : { data: [{ choice: 3, ms: 2_000 }] };
      return { data: [] };
    };
    expect(await answerQuestion(context(), QUIZ, input({ choice: 1 }), SAMPLE_T0 + times.open + 4_300)).toEqual({ choice: 3, ms: 2_000, value: 480 });
  });

  it("is refused after the answer opened, during a pause, for another question, or without joining", async () => {
    await expect(answerQuestion(context(), QUIZ, input(), SAMPLE_T0 + times.reveal)).rejects.toMatchObject({ status: 409, message: "Waktu habis." });
    await expect(answerQuestion(context(), QUIZ, input({ index: 1 }), SAMPLE_T0 + times.open + 4_300)).rejects.toMatchObject({ status: 409 });
    run = { pauses: [{ from: SAMPLE_T0 + times.open + 3_000, to: null }] };
    await expect(answerQuestion(context(), QUIZ, input(), SAMPLE_T0 + times.open + 4_300)).rejects.toMatchObject({ message: "Kuis sedang dijeda." });
    run = {};
    answer = q => (q.table === "mw_quiz_answers" ? { error: { code: "23503", message: "fk" } } : q.table === "mw_quizzes" ? { data: [{ id: QUIZ, title: "Kuis", mw_quiz_runs: [runRow()] }] } : { data: [] });
    await expect(answerQuestion(context(), QUIZ, input(), SAMPLE_T0 + times.open + 4_300)).rejects.toMatchObject({ status: 409, message: "Ketuk Ikut dulu untuk bermain." });
  });
});

describe("the MC's control", () => {
  it("does not exist for someone who is not the quiz's pengendali (panitia alone is not)", async () => {
    await expect(controlState(context(["panitia"]), QUIZ)).rejects.toMatchObject({ status: 404 });
  });

  it("does not exist for Pra WAM's admin role either (20 Nov 2026), nor for a grant without Admin WAM 2026", async () => {
    await expect(controlState(context(["admin"]), QUIZ)).rejects.toMatchObject({ status: 404 });
    grantApps = ["wam"];
    newRequest(false);
    await expect(controlState(context(), QUIZ)).rejects.toMatchObject({ status: 404 });
  });

  it("opens for a pengendali of the quiz, and for a holder of Admin WAM 2026 without asking", async () => {
    const base = answer;
    answer = q => (q.table === "mw_quiz_hosts" ? { data: [{ employee_id: ME }] } : base(q));
    const snap = await controlState(context(), QUIZ, SAMPLE_T0 + times.open + 1_000);
    expect(snap).toMatchObject({ players: 12, answered: 7 });
    expect(snap.question?.correct).toBeNull();
    newRequest(false);
    answer = base;
    await controlState(asWamAdmin(), QUIZ, SAMPLE_T0 + times.open + 1_000);
    expect(tables()).not.toContain("mw_quiz_hosts");
  });

  it("applies Lanjut on the rev it saw, and refuses an older one", async () => {
    run = { phase: "siap", question_index: -1 };
    await controlAct(asWamAdmin(), QUIZ, { runId: RUN, rev: 5, action: "buka-lobi" }, SAMPLE_T0);
    const update = fake.queries.find(q => q.table === "mw_quiz_runs" && has(q, "update"))!;
    expect(callsOf(update, "update")[0][0]).toMatchObject({ phase: "lobi", rev: 6 });
    expect(callsOf(update, "eq")).toEqual([["id", RUN], ["rev", 5]]);
    expect(notes.sent).toEqual([expect.objectContaining({ kind: "kuis", title: "Kuis dimulai", link: `/wam/acara/kuis/${QUIZ}`, to: { audience: { type: "semua" } } })]);
    await expect(controlAct(asWamAdmin(), QUIZ, { runId: RUN, rev: 4, action: "buka-lobi" }, SAMPLE_T0)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a step Lanjut does not name, and a lost race", async () => {
    run = { phase: "soal" };
    await expect(controlAct(asWamAdmin(), QUIZ, { runId: RUN, rev: 5, action: "lanjut-soal" }, SAMPLE_T0 + times.open + 1_000)).rejects.toMatchObject({ status: 409 });
    const base = answer;
    answer = q => (q.table === "mw_quiz_runs" ? { data: [] } : base(q));
    await expect(controlAct(asWamAdmin(), QUIZ, { runId: RUN, rev: 5, action: "jeda" }, SAMPLE_T0 + times.open + 1_000)).rejects.toMatchObject({ status: 409, message: "Sudah dilanjutkan dari layar lain. Lihat keadaan terbaru." });
  });
});

describe("the big screen", () => {
  const key = newScreenKey();
  it("answers only a key of the right shape, while the module is on, by the key's hash", async () => {
    expect(await screenState("kuis_pendek")).toBeNull();
    expect(fake.queries).toHaveLength(0);
    settings.kuis = false;
    expect(await screenState(key)).toBeNull();
    expect(fake.queries).toHaveLength(0);
    settings.kuis = true;
    const snap = await screenState(key, SAMPLE_T0 + times.open + 1_000);
    expect(snap).toMatchObject({ answered: 7, players: 12 });
    expect(callsOf(fake.queries[0], "eq")).toEqual([["screen_key_hash", hashScreenKey(key)]]);
    expect(hashScreenKey(key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("asks for the names of the podium's open places only", async () => {
    run = { phase: "podium", question_index: 7, podium_revealed: 1 };
    const tallies = [0, 1, 2, 3].map(i => ({
      employee_id: `22222222-2222-4222-8222-22222222222${i}`, alias: `Tokoh ${i}`, figure_key: "marie-curie", persona: "", colors: null, mystery_no: null, joined_at: new Date(SAMPLE_T0).toISOString(),
      total: 1000 - i * 100, correct: 3, correct_ms: 9000, last_correct_at: null, prev_total: 0, prev_correct_ms: 0, prev_last_correct_at: null,
    }));
    const base = answer;
    answer = q => (q.table === "rpc:mw_quiz_board" ? { data: tallies } : q.table === "employees" ? { data: [{ id: tallies[2].employee_id, full_name: "Contoh Tiga", nickname: "Tiga" }] } : base(q));
    const snap = await screenState(key, SAMPLE_T0);
    const names = fake.queries.find(q => q.table === "employees")!;
    expect(callsOf(names, "in")).toEqual([["id", [tallies[2].employee_id]]]);
    expect(snap?.podium?.map(entry => entry.name)).toEqual([null, null, "Tiga"]);
  });
});
