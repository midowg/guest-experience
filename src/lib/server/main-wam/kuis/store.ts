import "server-only";
import { KUIS_MIGRATION, aliasOf } from "@/lib/main-wam/kuis/admin";
import { QUIZ_PHASES, type Alias, type AnswerRow, type MineRow, type Pause, type QuizPhase, type QuizRun, type RunQuestion, type TallyRow } from "@/lib/main-wam/kuis/types";
import { isLevel } from "@/lib/main-wam/kuis/rules";
import { callName } from "@/lib/pra-wam/call-name";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing, mwWaiting } from "../errors";
import { holdsWamAcara } from "../staff";

/*
 * Kuis live's reads and writes (migration 202611200601). Every caller has passed the gate (phones and
 * the MC: requireModuleApi("kuis"); Admin WAM: requireApiAdmin; the big screen: its key and the module).
 * Before the migration a read finds nothing (the screens say "menunggu pembaruan sistem") and a write
 * answers 503 with the same words. Times on the wire are epoch ms; the database keeps timestamptz.
 */

const db = () => createPrivilegedClient();
export const QUIZ_COLUMNS = "id,title,screen_key_hint,created_by,created_at,updated_at";
export const RUN_COLUMNS = "id,quiz_id,number,phase,question_index,questions,phase_at,pauses,canceled,boards,podium_revealed,rev,ended_at";
const PLAYER_COLUMNS = "alias,figure_key,persona,colors,mystery_no,joined_at";

export const isId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const ms = (value: unknown): number => (typeof value === "string" ? Date.parse(value) : typeof value === "number" ? value : Number.NaN);
const ints = (value: unknown): number[] => (Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item)) : []);

/** A frozen question as the server keeps it; anything malformed is left out. */
function questionsOf(value: unknown): RunQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const options = Array.isArray(row.options) ? row.options.filter((option): option is string => typeof option === "string") : [];
    if (!isLevel(row.level) || typeof row.body !== "string" || options.length !== 4 || !Number.isInteger(row.correct)) return [];
    return [{ id: String(row.id ?? ""), level: row.level, body: row.body, options, correct: row.correct as number }];
  });
}

function pausesOf(value: unknown): Pause[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const row = item as { from?: unknown; to?: unknown } | null;
    if (!row || typeof row.from !== "number" || !Number.isFinite(row.from)) return [];
    return [{ from: row.from, to: typeof row.to === "number" && Number.isFinite(row.to) ? row.to : null }];
  });
}

export type RunRow = {
  id: string; quiz_id: string; number: number; phase: string; question_index: number; questions: unknown; phase_at: string; pauses: unknown;
  canceled: unknown; boards: unknown; podium_revealed: number; rev: number; ended_at: string | null;
};

export function runFromRow(row: RunRow): QuizRun {
  return {
    id: row.id, quizId: row.quiz_id, number: row.number,
    phase: (QUIZ_PHASES as readonly string[]).includes(row.phase) ? row.phase as QuizPhase : "selesai",
    index: row.question_index, questions: questionsOf(row.questions), phaseAt: ms(row.phase_at), pauses: pausesOf(row.pauses),
    canceled: ints(row.canceled), boards: ints(row.boards), podiumRevealed: row.podium_revealed ?? 0, rev: row.rev, endedAt: row.ended_at ? ms(row.ended_at) : null,
  };
}

/** The run's columns to write for a change (flow.ts RunPatch), times as timestamptz. */
export function runPatchRow(patch: Partial<QuizRun>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.phase !== undefined) out.phase = patch.phase;
  if (patch.index !== undefined) out.question_index = patch.index;
  if (patch.phaseAt !== undefined) out.phase_at = new Date(patch.phaseAt).toISOString();
  if (patch.pauses !== undefined) out.pauses = patch.pauses;
  if (patch.canceled !== undefined) out.canceled = patch.canceled;
  if (patch.boards !== undefined) out.boards = patch.boards;
  if (patch.podiumRevealed !== undefined) out.podium_revealed = patch.podiumRevealed;
  if (patch.endedAt !== undefined) out.ended_at = patch.endedAt === null ? null : new Date(patch.endedAt).toISOString();
  return out;
}

type QuizWithRuns = { id: string; title: string; mw_quiz_runs?: RunRow[] | RunRow | null };

/**
 * A quiz and its latest game, in one query (every poll of a phone and of the MC). null: no such quiz,
 * or before the migration (`migrated` says which).
 */
export async function quizAndRun(quizId: string): Promise<{ quiz: { id: string; title: string } | null; run: QuizRun | null; migrated: boolean }> {
  if (!isId(quizId)) return { quiz: null, run: null, migrated: true };
  const { data, error } = await db().from("mw_quizzes").select(`id,title,mw_quiz_runs(${RUN_COLUMNS})`).eq("id", quizId)
    .order("number", { referencedTable: "mw_quiz_runs", ascending: false }).limit(1, { referencedTable: "mw_quiz_runs" }).maybeSingle();
  if (error) {
    if (mwMissing(error)) { console.warn(`main-wam: menunggu migrasi ${KUIS_MIGRATION}`); return { quiz: null, run: null, migrated: false }; }
    mwFail(error, KUIS_MIGRATION);
  }
  const row = data as QuizWithRuns | null;
  if (!row) return { quiz: null, run: null, migrated: true };
  const runs = Array.isArray(row.mw_quiz_runs) ? row.mw_quiz_runs : row.mw_quiz_runs ? [row.mw_quiz_runs] : [];
  return { quiz: { id: row.id, title: row.title }, run: runs[0] ? runFromRow(runs[0]) : null, migrated: true };
}

/** The big screen's quiz by the sha256 of its key, with its latest game. */
export async function quizAndRunByKey(keyHash: string): Promise<{ quiz: { id: string; title: string }; run: QuizRun | null } | null> {
  const { data, error } = await db().from("mw_quizzes").select(`id,title,mw_quiz_runs(${RUN_COLUMNS})`).eq("screen_key_hash", keyHash)
    .order("number", { referencedTable: "mw_quiz_runs", ascending: false }).limit(1, { referencedTable: "mw_quiz_runs" }).maybeSingle();
  if (error) { if (mwMissing(error)) return null; mwFail(error, KUIS_MIGRATION); }
  const row = data as QuizWithRuns | null;
  if (!row) return null;
  const runs = Array.isArray(row.mw_quiz_runs) ? row.mw_quiz_runs : row.mw_quiz_runs ? [row.mw_quiz_runs] : [];
  return { quiz: { id: row.id, title: row.title }, run: runs[0] ? runFromRow(runs[0]) : null };
}

/** How many joined a game. */
export async function playerCount(runId: string): Promise<number> {
  const { count, error } = await db().from("mw_quiz_players").select("employee_id", { count: "exact", head: true }).eq("run_id", runId);
  if (error) mwFail(error, KUIS_MIGRATION);
  return count ?? 0;
}

/** How many answered a question. */
export async function answeredCount(runId: string, index: number): Promise<number> {
  const { count, error } = await db().from("mw_quiz_answers").select("employee_id", { count: "exact", head: true }).eq("run_id", runId).eq("question_index", index);
  if (error) mwFail(error, KUIS_MIGRATION);
  return count ?? 0;
}

type AnswerDb = { employee_id: string; question_index: number; choice: number; ms: number; correct: boolean; points: number; tapped_at: string };
const answerOf = (row: AnswerDb): AnswerRow => ({ employeeId: row.employee_id, index: row.question_index, choice: row.choice, ms: row.ms, correct: row.correct, points: row.points, tappedAt: ms(row.tapped_at) });
const ANSWER_COLUMNS = "employee_id,question_index,choice,ms,correct,points,tapped_at";

/** A player's own row and answers (one query); null: not joined. */
export async function mineOf(runId: string, employeeId: string): Promise<MineRow | null> {
  const { data, error } = await db().from("mw_quiz_players").select(`${PLAYER_COLUMNS},mw_quiz_answers(${ANSWER_COLUMNS})`).eq("run_id", runId).eq("employee_id", employeeId).maybeSingle();
  if (error) mwFail(error, KUIS_MIGRATION);
  if (!data) return null;
  const row = data as unknown as { alias: string; figure_key: string | null; persona: string; colors: unknown; mystery_no: number | null; joined_at: string; mw_quiz_answers: AnswerDb[] | null };
  return { alias: aliasOf(row), joinedAt: ms(row.joined_at), answers: (row.mw_quiz_answers ?? []).map(answerOf) };
}

/** The answers to one question (the spread, the quickest). */
export async function questionAnswers(runId: string, index: number): Promise<AnswerRow[]> {
  const { data, error } = await db().from("mw_quiz_answers").select(ANSWER_COLUMNS).eq("run_id", runId).eq("question_index", index).limit(2000);
  if (error) mwFail(error, KUIS_MIGRATION);
  return ((data ?? []) as AnswerDb[]).map(answerOf);
}

type BoardDb = {
  employee_id: string; alias: string; figure_key: string | null; persona: string; colors: unknown; mystery_no: number | null; joined_at: string;
  total: number; correct: number; correct_ms: number | string; last_correct_at: string | null; prev_total: number; prev_correct_ms: number | string; prev_last_correct_at: string | null;
};

/** Everyone's totals up to a question and up to an earlier one (mw_quiz_board, one query). */
export async function tallies(runId: string, upto: number, prev: number): Promise<TallyRow[]> {
  const { data, error } = await db().rpc("mw_quiz_board", { p_run: runId, p_upto: upto, p_prev: prev });
  if (error) mwFail(error, KUIS_MIGRATION);
  return ((data ?? []) as BoardDb[]).map(row => ({
    employeeId: row.employee_id, alias: aliasOf(row), joinedAt: ms(row.joined_at),
    total: row.total, correct: row.correct, correctMs: Number(row.correct_ms), lastCorrectAt: row.last_correct_at ? ms(row.last_correct_at) : null,
    prevTotal: row.prev_total, prevCorrectMs: Number(row.prev_correct_ms), prevLastCorrectAt: row.prev_last_correct_at ? ms(row.prev_last_correct_at) : null,
  }));
}

/** The lobby's tokoh in the order they joined (the big screen). */
export async function joinedAliases(runId: string): Promise<Alias[]> {
  const { data, error } = await db().from("mw_quiz_players").select(PLAYER_COLUMNS).eq("run_id", runId).order("joined_at").limit(1000);
  if (error) mwFail(error, KUIS_MIGRATION);
  return ((data ?? []) as { alias: string; figure_key: string | null; persona: string; colors: unknown; mystery_no: number | null }[]).map(aliasOf);
}

/** Nama panggilan of a few people (the podium's open places). */
export async function callNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await db().from("employees").select("id,full_name,nickname").in("id", [...ids]);
  if (error) return new Map();
  return new Map(((data ?? []) as { id: string; full_name: string; nickname: string | null }[]).map(row => [row.id, callName({ fullName: row.full_name, nickname: row.nickname })]));
}

/**
 * May this person run this quiz: a pengendali chosen for it, or a holder of Admin WAM 2026 (with their WAM
 * account; holdsWamAcara). Panitia WAM alone is not, nor Pra WAM's admin role (20 Nov 2026).
 */
export async function isQuizHost(quizId: string, viewer: { id: string }): Promise<boolean> {
  if (await holdsWamAcara(viewer.id)) return true;
  const { data, error } = await db().from("mw_quiz_hosts").select("employee_id").eq("quiz_id", quizId).eq("employee_id", viewer.id).maybeSingle();
  if (error) { if (mwMissing(error)) return false; mwFail(error, KUIS_MIGRATION); }
  return !!data;
}

/** Save a change to a run if nobody changed it since `rev` (two MCs, a double press); the new rev, or null. */
export async function saveRun(run: QuizRun, patch: Partial<QuizRun>): Promise<number | null> {
  const next = run.rev + 1;
  const { data, error } = await db().from("mw_quiz_runs").update({ ...runPatchRow(patch), rev: next, updated_at: new Date().toISOString() })
    .eq("id", run.id).eq("rev", run.rev).select("rev");
  if (error) mwFail(error, KUIS_MIGRATION);
  return (data ?? []).length ? next : null;
}

/** A writer before the migration. */
export const kuisWaiting = () => mwWaiting(KUIS_MIGRATION);
export const notFound = (what = "Kuis tidak ditemukan.") => new ServiceError(404, what);
