import "server-only";
import { KUIS_MIGRATION, MAX_HOSTS, MAX_QUESTIONS, playOrder, type QuestionInput } from "@/lib/main-wam/kuis/admin";
import { levelLabels, rankTallies, secondsText } from "@/lib/main-wam/kuis/rules";
import type { QuizLevel, QuizPhase } from "@/lib/main-wam/kuis/types";
import { kuisScreenPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { writeXlsx } from "../../xlsx-write";
import { mwFail, mwMissing } from "../errors";
import { hashScreenKey, newScreenKey, screenKeyHint } from "./screen";
import { RUN_COLUMNS, isId, notFound, questionAnswers, runFromRow, tallies, type RunRow } from "./store";

/*
 * Admin WAM → Main WAM → Kuis live (rancangan §8a): quizzes and their questions (text, 4 options, the
 * key, the level; played easy to very hard, the admin's order within a level; no images in v1), the
 * pengendali, the big screen's link (shown once), new games, and the results with names for the prizes
 * (the only place names and scores meet; the Excel file too). Every caller has passed requireApiAdmin
 * or requireAdminPage. Admins see full names (aturan-wam §4).
 */

const db = () => createPrivilegedClient();
const check = (id: string) => { if (!isId(id)) throw notFound(); };

export type AdminQuizSummary = {
  id: string; title: string; questions: number; hosts: number; screenHint: string | null;
  live: { number: number; phase: QuizPhase } | null; games: number; createdAt: string;
};
export type AdminQuestion = { id: string; level: QuizLevel; sort: number; body: string; options: string[]; correct: number };
export type AdminRun = { id: string; number: number; phase: QuizPhase; index: number; count: number; players: number; createdAt: string; endedAt: string | null };
export type AdminPerson = { id: string; fullName: string; department: string };
export type AdminQuiz = {
  quiz: { id: string; title: string; screenHint: string | null };
  questions: AdminQuestion[];
  hosts: AdminPerson[];
  runs: AdminRun[];
  people: AdminPerson[];
};

const phaseLabels: Record<QuizPhase, string> = {
  siap: "Siap, belum dibuka", lobi: "Lobi terbuka", bersiap: "Berjalan", soal: "Berjalan", batal: "Berjalan", skor: "Papan skor", podium: "Podium", selesai: "Selesai",
};
export const adminPhaseLabel = (phase: QuizPhase) => phaseLabels[phase];

export async function adminQuizzes(): Promise<{ migrated: boolean; quizzes: AdminQuizSummary[] }> {
  const { data, error } = await db().from("mw_quizzes")
    .select("id,title,screen_key_hint,created_at,mw_quiz_questions(count),mw_quiz_hosts(count),mw_quiz_runs(number,phase)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) { if (mwMissing(error)) return { migrated: false, quizzes: [] }; mwFail(error, KUIS_MIGRATION); }
  type Row = { id: string; title: string; screen_key_hint: string | null; created_at: string; mw_quiz_questions: { count: number }[]; mw_quiz_hosts: { count: number }[]; mw_quiz_runs: { number: number; phase: QuizPhase }[] };
  return {
    migrated: true,
    quizzes: ((data ?? []) as unknown as Row[]).map(row => {
      const live = (row.mw_quiz_runs ?? []).find(run => run.phase !== "selesai") ?? null;
      return {
        id: row.id, title: row.title, questions: row.mw_quiz_questions?.[0]?.count ?? 0, hosts: row.mw_quiz_hosts?.[0]?.count ?? 0, screenHint: row.screen_key_hint,
        live: live ? { number: live.number, phase: live.phase } : null, games: (row.mw_quiz_runs ?? []).length, createdAt: row.created_at,
      };
    }),
  };
}

export async function createQuiz(title: string, by: string): Promise<{ id: string }> {
  const { data, error } = await db().from("mw_quizzes").insert({ title, created_by: by.slice(0, 150) }).select("id").single();
  if (error) mwFail(error, KUIS_MIGRATION);
  return { id: data.id as string };
}

export async function adminQuiz(id: string): Promise<AdminQuiz | null> {
  if (!isId(id)) return null;
  const [quiz, questions, hosts, runs, people] = await Promise.all([
    db().from("mw_quizzes").select("id,title,screen_key_hint").eq("id", id).maybeSingle(),
    db().from("mw_quiz_questions").select("id,level,sort,body,options,correct,created_at").eq("quiz_id", id).limit(MAX_QUESTIONS + 10),
    db().from("mw_quiz_hosts").select("employee_id,employees(full_name,department)").eq("quiz_id", id),
    db().from("mw_quiz_runs").select("id,number,phase,question_index,questions,created_at,ended_at,mw_quiz_players(count)").eq("quiz_id", id).order("number", { ascending: false }).limit(50),
    db().from("employees").select("id,full_name,department").eq("active", true).order("full_name").limit(2000),
  ]);
  for (const result of [quiz, questions, hosts, runs]) if (result.error) mwFail(result.error, KUIS_MIGRATION);
  if (!quiz.data) return null;
  type QuestionRow = { id: string; level: QuizLevel; sort: number; body: string; options: string[]; correct: number; created_at: string };
  type HostRow = { employee_id: string; employees: { full_name: string; department: string } | { full_name: string; department: string }[] | null };
  type RunDb = { id: string; number: number; phase: QuizPhase; question_index: number; questions: unknown[]; created_at: string; ended_at: string | null; mw_quiz_players: { count: number }[] };
  const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? value[0] ?? null : value);
  return {
    quiz: { id: quiz.data.id as string, title: quiz.data.title as string, screenHint: (quiz.data.screen_key_hint as string | null) ?? null },
    questions: playOrder(((questions.data ?? []) as QuestionRow[]).map(row => ({ ...row, createdAt: row.created_at })))
      .map(row => ({ id: row.id, level: row.level, sort: row.sort, body: row.body, options: row.options, correct: row.correct })),
    hosts: ((hosts.data ?? []) as unknown as HostRow[]).map(row => ({ id: row.employee_id, fullName: one(row.employees)?.full_name ?? "Tanpa nama", department: one(row.employees)?.department ?? "" }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "id")),
    runs: ((runs.data ?? []) as unknown as RunDb[]).map(row => ({
      id: row.id, number: row.number, phase: row.phase, index: row.question_index, count: Array.isArray(row.questions) ? row.questions.length : 0,
      players: row.mw_quiz_players?.[0]?.count ?? 0, createdAt: row.created_at, endedAt: row.ended_at,
    })),
    people: ((people.data ?? []) as { id: string; full_name: string; department: string }[]).map(row => ({ id: row.id, fullName: row.full_name, department: row.department })),
  };
}

export async function renameQuiz(id: string, title: string): Promise<void> {
  check(id);
  const { data, error } = await db().from("mw_quizzes").update({ title, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) mwFail(error, KUIS_MIGRATION);
  if (!data?.length) throw notFound();
}

/** A quiz with a game going on (not over, not only made) is not deleted: end it first. */
export async function deleteQuiz(id: string): Promise<void> {
  check(id);
  const { data: live, error } = await db().from("mw_quiz_runs").select("id").eq("quiz_id", id).not("phase", "in", "(siap,selesai)").limit(1);
  if (error) mwFail(error, KUIS_MIGRATION);
  if (live?.length) throw new ServiceError(409, "Kuis ini sedang dimainkan. Tunggu sampai selesai sebelum menghapusnya.");
  const { error: deleteError } = await db().from("mw_quizzes").delete().eq("id", id);
  if (deleteError) mwFail(deleteError, KUIS_MIGRATION);
}

async function levelEnd(quizId: string, level: number): Promise<number> {
  const { data, error } = await db().from("mw_quiz_questions").select("sort").eq("quiz_id", quizId).eq("level", level).order("sort", { ascending: false }).limit(1);
  if (error) mwFail(error, KUIS_MIGRATION);
  return ((data ?? [])[0]?.sort as number | undefined ?? -1) + 1;
}

export async function addQuestion(quizId: string, input: QuestionInput): Promise<void> {
  check(quizId);
  const { count, error } = await db().from("mw_quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", quizId);
  if (error) mwFail(error, KUIS_MIGRATION);
  if ((count ?? 0) >= MAX_QUESTIONS) throw new ServiceError(409, `Satu kuis paling banyak ${MAX_QUESTIONS} soal.`);
  const sort = await levelEnd(quizId, input.level);
  const { error: insertError } = await db().from("mw_quiz_questions").insert({ quiz_id: quizId, ...input, sort });
  if (insertError) { if (insertError.code === "23503") throw notFound(); mwFail(insertError, KUIS_MIGRATION); }
}

/** A changed question; moving it to another level puts it last there. Games already made keep their copy. */
export async function updateQuestion(quizId: string, questionId: string, input: QuestionInput): Promise<void> {
  check(quizId); check(questionId);
  const { data: current, error } = await db().from("mw_quiz_questions").select("level").eq("id", questionId).eq("quiz_id", quizId).maybeSingle();
  if (error) mwFail(error, KUIS_MIGRATION);
  if (!current) throw notFound("Soal tidak ditemukan.");
  const sort = current.level === input.level ? undefined : await levelEnd(quizId, input.level);
  const { error: updateError } = await db().from("mw_quiz_questions").update({ ...input, ...(sort === undefined ? {} : { sort }), updated_at: new Date().toISOString() }).eq("id", questionId).eq("quiz_id", quizId);
  if (updateError) mwFail(updateError, KUIS_MIGRATION);
}

export async function deleteQuestion(quizId: string, questionId: string): Promise<void> {
  check(quizId); check(questionId);
  const { error } = await db().from("mw_quiz_questions").delete().eq("id", questionId).eq("quiz_id", quizId);
  if (error) mwFail(error, KUIS_MIGRATION);
}

/** Up or down within its level (the order across levels is always easy to very hard). */
export async function moveQuestion(quizId: string, questionId: string, direction: "naik" | "turun"): Promise<void> {
  check(quizId); check(questionId);
  const { data, error } = await db().from("mw_quiz_questions").select("id,level,sort,created_at").eq("quiz_id", quizId).limit(MAX_QUESTIONS + 10);
  if (error) mwFail(error, KUIS_MIGRATION);
  const rows = playOrder(((data ?? []) as { id: string; level: number; sort: number; created_at: string }[]).map(row => ({ ...row, createdAt: row.created_at })));
  const at = rows.findIndex(row => row.id === questionId);
  if (at < 0) throw notFound("Soal tidak ditemukan.");
  const level = rows.filter(row => row.level === rows[at].level);
  const within = level.findIndex(row => row.id === questionId);
  const other = level[direction === "naik" ? within - 1 : within + 1];
  if (!other) return;
  // Number the level 0, 1, 2 … with the two swapped (sorts may tie or have gaps).
  const order = level.map(row => row.id);
  order[within] = other.id;
  order[level.indexOf(other)] = questionId;
  const results = await Promise.all(order.map((id, sort) => db().from("mw_quiz_questions").update({ sort }).eq("id", id).eq("quiz_id", quizId)));
  for (const result of results) if (result.error) mwFail(result.error, KUIS_MIGRATION);
}

export async function addHost(quizId: string, employeeId: string, by: string): Promise<void> {
  check(quizId);
  const { count, error } = await db().from("mw_quiz_hosts").select("employee_id", { count: "exact", head: true }).eq("quiz_id", quizId);
  if (error) mwFail(error, KUIS_MIGRATION);
  if ((count ?? 0) >= MAX_HOSTS) throw new ServiceError(409, `Paling banyak ${MAX_HOSTS} pengendali per kuis.`);
  const { data: person } = await db().from("employees").select("id,active").eq("id", employeeId).maybeSingle();
  if (!person?.active) throw new ServiceError(422, "Orang ini tidak aktif di Data karyawan.");
  const { error: insertError } = await db().from("mw_quiz_hosts").upsert({ quiz_id: quizId, employee_id: employeeId, added_by: by.slice(0, 150) }, { onConflict: "quiz_id,employee_id", ignoreDuplicates: true });
  if (insertError) { if (insertError.code === "23503") throw notFound(); mwFail(insertError, KUIS_MIGRATION); }
}

export async function removeHost(quizId: string, employeeId: string): Promise<void> {
  check(quizId); check(employeeId);
  const { error } = await db().from("mw_quiz_hosts").delete().eq("quiz_id", quizId).eq("employee_id", employeeId);
  if (error) mwFail(error, KUIS_MIGRATION);
}

/** A new big-screen link: the address is returned once (only the key's hash is kept); the old link stops. */
export async function newScreenLink(quizId: string): Promise<{ path: string; hint: string }> {
  check(quizId);
  const key = newScreenKey();
  const { data, error } = await db().from("mw_quizzes").update({ screen_key_hash: hashScreenKey(key), screen_key_hint: screenKeyHint(key), updated_at: new Date().toISOString() }).eq("id", quizId).select("id");
  if (error) mwFail(error, KUIS_MIGRATION);
  if (!data?.length) throw notFound();
  return { path: kuisScreenPath(key), hint: screenKeyHint(key) };
}

/**
 * A new game with the quiz's questions as they are now (frozen, in play order). A game that is not over
 * ends (its answers and results stay). Starts at "siap": the MC opens the lobby.
 */
export async function newRun(quizId: string, by: string): Promise<{ id: string; number: number }> {
  check(quizId);
  const [questions, last] = await Promise.all([
    db().from("mw_quiz_questions").select("id,level,sort,body,options,correct,created_at").eq("quiz_id", quizId).limit(MAX_QUESTIONS + 10),
    db().from("mw_quiz_runs").select("number").eq("quiz_id", quizId).order("number", { ascending: false }).limit(1),
  ]);
  if (questions.error) mwFail(questions.error, KUIS_MIGRATION);
  if (last.error) mwFail(last.error, KUIS_MIGRATION);
  type Row = { id: string; level: QuizLevel; sort: number; body: string; options: string[]; correct: number; created_at: string };
  const ordered = playOrder(((questions.data ?? []) as Row[]).map(row => ({ ...row, createdAt: row.created_at }))).slice(0, MAX_QUESTIONS);
  if (!ordered.length) throw new ServiceError(422, "Tambahkan soal dulu sebelum membuat permainan.");
  const now = new Date().toISOString();
  const { error: endError } = await db().from("mw_quiz_runs").update({ phase: "selesai", ended_at: now, updated_at: now }).eq("quiz_id", quizId).neq("phase", "selesai");
  if (endError) mwFail(endError, KUIS_MIGRATION);
  const number = (((last.data ?? [])[0]?.number as number | undefined) ?? 0) + 1;
  const { data, error } = await db().from("mw_quiz_runs").insert({
    quiz_id: quizId, number, created_by: by.slice(0, 150), phase_at: now,
    questions: ordered.map(row => ({ id: row.id, level: row.level, body: row.body, options: row.options, correct: row.correct })),
  }).select("id,number").single();
  if (error) { if (error.code === "23505") throw new ServiceError(409, "Permainan baru baru saja dibuat dari layar lain. Muat ulang."); mwFail(error, KUIS_MIGRATION); }
  return { id: data.id as string, number: data.number as number };
}

export type AdminResultRow = { rank: number; fullName: string; department: string; alias: string; total: number; correct: number; correctTime: string };
export type AdminQuestionStat = { index: number; level: QuizLevel; body: string; answered: number; correct: number; canceled: boolean };
export type AdminResults = { run: AdminRun; title: string; rows: AdminResultRow[]; questions: AdminQuestionStat[] };

/** A game's results with names, best first (the tie rules of the game), and how each question went. */
export async function runResults(quizId: string, runId: string): Promise<AdminResults> {
  check(quizId); check(runId);
  const { data, error } = await db().from("mw_quiz_runs").select(`${RUN_COLUMNS},created_at,mw_quizzes(title),mw_quiz_players(count)`).eq("id", runId).eq("quiz_id", quizId).maybeSingle();
  if (error) mwFail(error, KUIS_MIGRATION);
  if (!data) throw notFound("Permainan tidak ditemukan.");
  const row = data as unknown as RunRow & { created_at: string; mw_quizzes: { title: string } | null; mw_quiz_players: { count: number }[] };
  const run = runFromRow(row);
  const last = run.questions.length - 1;
  const [rows, people, perQuestion] = await Promise.all([
    tallies(run.id, last, -1),
    db().from("mw_quiz_players").select("employee_id,employees(full_name,department)").eq("run_id", run.id).limit(2000),
    Promise.all(run.questions.map((_, index) => questionAnswers(run.id, index))),
  ]);
  if (people.error) mwFail(people.error, KUIS_MIGRATION);
  type Person = { employee_id: string; employees: { full_name: string; department: string } | { full_name: string; department: string }[] | null };
  const names = new Map(((people.data ?? []) as unknown as Person[]).map(item => {
    const employee = Array.isArray(item.employees) ? item.employees[0] : item.employees;
    return [item.employee_id, { fullName: employee?.full_name ?? "Tanpa nama", department: employee?.department ?? "" }];
  }));
  const ranked = rankTallies(rows.map(item => ({ ...item, key: item.employeeId })));
  return {
    title: row.mw_quizzes?.title ?? "Kuis live",
    run: { id: run.id, number: run.number, phase: run.phase, index: run.index, count: run.questions.length, players: rows.length, createdAt: row.created_at, endedAt: row.ended_at },
    rows: ranked.map(item => ({
      rank: item.rank, fullName: names.get(item.employeeId)?.fullName ?? "Tanpa nama", department: names.get(item.employeeId)?.department ?? "",
      alias: item.alias.name, total: item.total, correct: item.correct, correctTime: secondsText(item.correctMs),
    })),
    questions: run.questions.map((question, index) => ({
      index, level: question.level, body: question.body, answered: perQuestion[index].length, correct: perQuestion[index].filter(answer => answer.correct).length, canceled: run.canceled.includes(index),
    })),
  };
}

/** The results as an Excel file: Hasil (everyone with names) and Soal (how each question went). */
export async function resultsXlsx(quizId: string, runId: string): Promise<{ file: Buffer; name: string }> {
  const results = await runResults(quizId, runId);
  const file = writeXlsx([
    { name: "Hasil", widths: [8, 30, 22, 26, 10, 10, 20], rows: [["Peringkat", "Nama", "Departemen", "Tokoh", "Nilai", "Benar", "Waktu benar (detik)"], ...results.rows.map(row => [row.rank, row.fullName, row.department, row.alias, row.total, row.correct, row.correctTime])] },
    { name: "Soal", widths: [6, 14, 60, 12, 10, 14], rows: [["No", "Level", "Soal", "Menjawab", "Benar", "Keterangan"], ...results.questions.map(item => [item.index + 1, levelLabels[item.level], item.body, item.answered, item.correct, item.canceled ? "Dibatalkan" : ""])] },
  ]);
  const safe = results.title.replace(/[^\p{L}\p{N} -]/gu, "").trim().replace(/\s+/g, "-").slice(0, 40) || "kuis";
  return { file, name: `hasil-${safe}-permainan-${results.run.number}.xlsx` };
}
