import "server-only";
import { randomInt } from "node:crypto";
import {
  answered, cleanAnswer, complete, editable, progressOf, shows,
  type AnswerValue, type Answers, type Progress, type QContent, type QForm, type QQuestion,
} from "@/lib/pra-wam/questionnaire";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { currentForm, departmentOptions, formContent, peopleOptions, questionnaireMissing, questionnaireWaiting } from "./questionnaire";

/*
 * A person's own answers to the questionnaire (migration 202611040011): reading them, saving one
 * at a time as they go, and sending the anonymous section once. Answers are keyed by the
 * question's fixed key in the app and by its id in the database.
 *
 * The anonymous section is stored apart: its rows in cq_anon_answers carry no person and only the
 * day, and cq_anon_receipts only says that someone sent it (also by day). Nothing here logs who
 * sent which answers.
 */

export type Mine = { answers: Answers; consentAt: string | null; completedAt: string | null; anonymousSent: boolean; progress: Progress };
type Content = Pick<QContent, "sections" | "questions">;

const failed = (error: { code?: string; message?: string }): never => {
  if (questionnaireMissing(error)) throw questionnaireWaiting();
  databaseError({ message: error.message ?? "", code: error.code });
};

/**
 * The form as people may answer it right now, or why not. `preview` (Admin WAM only) also lets a
 * draft be answered, so it can be tried before it opens; those answers are test data.
 */
async function openForm(preview = false): Promise<QForm> {
  const form = await currentForm();
  if (!form) throw new ServiceError(404, "Kuesioner belum dibuka.");
  if (form.status === "draf") {
    if (!preview) throw new ServiceError(404, "Kuesioner belum dibuka.");
    return form;
  }
  if (!editable(form)) throw new ServiceError(409, "Kuesioner sudah ditutup. Jawaban tidak bisa diubah lagi.");
  return form;
}

/** Sections and questions people see: no hidden ones. */
export function shownContent(content: Content): Content {
  const sections = content.sections.filter(section => !section.hidden);
  const ids = new Set(sections.map(section => section.id));
  return { sections, questions: content.questions.filter(question => !question.hidden && ids.has(question.sectionId)) };
}

const anonymousSectionIds = (content: Content) => new Set(content.sections.filter(section => section.anonymous).map(section => section.id));

/** My named answers, consent and completion, and whether my anonymous section is in. */
export async function myAnswers(form: Pick<QForm, "id">, employeeId: string, content?: Content): Promise<Mine> {
  const client = createPrivilegedClient();
  const [all, rows, progress, receipt] = await Promise.all([
    content ?? formContent(form.id),
    client.from("cq_answers").select("question_id,value").eq("form_id", form.id).eq("employee_id", employeeId),
    client.from("cq_progress").select("consent_at,completed_at").eq("form_id", form.id).eq("employee_id", employeeId).maybeSingle(),
    client.from("cq_anon_receipts").select("submitted_on").eq("form_id", form.id).eq("employee_id", employeeId).maybeSingle(),
  ]);
  for (const result of [rows, progress, receipt]) if (result.error) failed(result.error);
  const shown = shownContent(all);
  const keyOf = new Map(shown.questions.map(question => [question.id, question.key]));
  const answers: Answers = {};
  for (const row of (rows.data ?? []) as { question_id: string; value: AnswerValue }[]) {
    const key = keyOf.get(row.question_id);
    if (key) answers[key] = row.value;
  }
  const anonymousSent = !!receipt.data;
  const state = progress.data as { consent_at: string | null; completed_at: string | null } | null;
  return { answers, consentAt: state?.consent_at ?? null, completedAt: state?.completed_at ?? null, anonymousSent, progress: progressOf(shown, answers, anonymousSent) };
}

/** For Beranda: how far I am, or null when there is nothing to show (no form, a draft, or no migration). */
export async function myQuestionnaireCard(employeeId: string): Promise<{ form: QForm; progress: Progress } | null> {
  const form = await currentForm();
  if (!form || form.status === "draf") return null;
  const mine = await myAnswers(form, employeeId);
  return { form, progress: mine.progress };
}

/** What department and person questions may hold; the person themself is never on the list. */
async function knownLists(question: QQuestion, employeeId: string) {
  if (question.kind === "department") return { departments: await departmentOptions() };
  if (question.kind === "person") return { people: (await peopleOptions()).filter(person => person.id !== employeeId).map(person => person.id) };
  return {};
}

const clean = async (question: QQuestion, raw: unknown, employeeId: string): Promise<AnswerValue> => {
  const result = cleanAnswer(question, raw, await knownLists(question, employeeId));
  if ("problem" in result) throw new ServiceError(422, result.problem, { [question.key]: [result.problem] });
  return result.value;
};

/** Sets or clears completed_at to match the progress now; keeps the first time it was done. */
async function settleProgress(formId: string, employeeId: string, done: boolean, patch: { consent_at?: string | null } = {}) {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("cq_progress").select("consent_at,completed_at").eq("form_id", formId).eq("employee_id", employeeId).maybeSingle();
  if (error) failed(error);
  const now = new Date().toISOString();
  const current = data as { consent_at: string | null; completed_at: string | null } | null;
  const completed_at = done ? current?.completed_at ?? now : null;
  // Consent keeps the moment it was first given; unticking takes it back.
  const consent_at = "consent_at" in patch ? (patch.consent_at ? current?.consent_at ?? patch.consent_at : null) : current?.consent_at ?? null;
  const { error: saveError } = await client.from("cq_progress").upsert({ form_id: formId, employee_id: employeeId, consent_at, completed_at, updated_at: now }, { onConflict: "form_id,employee_id" });
  if (saveError) failed(saveError);
  return { consentAt: consent_at, completedAt: completed_at };
}

/**
 * Saves one named answer. Empty answers remove the row, so "answered" means a stored value. Never
 * for the anonymous section: that goes in one piece through submitAnonymous.
 */
export async function saveAnswer(employeeId: string, key: string, raw: unknown, { preview = false }: { preview?: boolean } = {}): Promise<{ value: AnswerValue; progress: Progress; completedAt: string | null }> {
  const form = await openForm(preview);
  const content = shownContent(await formContent(form.id));
  const question = content.questions.find(item => item.key === key);
  if (!question) throw new ServiceError(404, "Pertanyaan ini tidak ada lagi. Muat ulang halaman.");
  if (anonymousSectionIds(content).has(question.sectionId) || question.visibility === "anon") {
    throw new ServiceError(422, "Bagian anonim dikirim sekaligus, tanpa nama.");
  }
  const value = await clean(question, raw, employeeId);
  const client = createPrivilegedClient();
  const write = answered(value)
    ? await client.from("cq_answers").upsert({ form_id: form.id, question_id: question.id, employee_id: employeeId, value, updated_at: new Date().toISOString() }, { onConflict: "question_id,employee_id" })
    : await client.from("cq_answers").delete().eq("question_id", question.id).eq("employee_id", employeeId);
  if (write.error) failed(write.error);
  const mine = await myAnswers(form, employeeId, content);
  const patch = question.kind === "consent" ? { consent_at: value === true ? new Date().toISOString() : null } : {};
  const { completedAt } = await settleProgress(form.id, employeeId, mine.progress.done, patch);
  return { value, progress: mine.progress, completedAt };
}

/**
 * Sends the anonymous section once, all its answers checked first. The answers go in with no
 * person and only the day (the column default); the receipt only says that this person sent it.
 * The receipt goes in first, so a second send (two taps, two phones) stops at its primary key
 * and never doubles the answers; if the answers then fail, the receipt is taken back so the
 * person can try again. The rows are shuffled so their order does not follow the questions.
 */
export async function submitAnonymous(employeeId: string, raw: Record<string, unknown>, { preview = false }: { preview?: boolean } = {}): Promise<{ progress: Progress; completedAt: string | null }> {
  const form = await openForm(preview);
  const content = shownContent(await formContent(form.id));
  const anonymous = anonymousSectionIds(content);
  const questions = content.questions.filter(question => anonymous.has(question.sectionId));
  if (!questions.length) throw new ServiceError(404, "Kuesioner ini tidak punya bagian anonim.");
  const known = new Set(questions.map(question => question.key));
  const stray = Object.keys(raw).filter(key => !known.has(key));
  if (stray.length) throw new ServiceError(422, "Ada jawaban yang bukan dari bagian anonim. Muat ulang halaman.");

  const client = createPrivilegedClient();
  const { data: sent, error: sentError } = await client.from("cq_anon_receipts").select("submitted_on").eq("form_id", form.id).eq("employee_id", employeeId).maybeSingle();
  if (sentError) failed(sentError);
  if (sent) throw new ServiceError(409, "Bagian anonim sudah kamu kirim. Bagian ini hanya bisa dikirim sekali.");

  // Branching may look at named answers (e.g. position) as well as this section's own.
  const mine = await myAnswers(form, employeeId, content);
  const cleaned: Answers = {};
  for (const question of questions) if (raw[question.key] !== undefined) cleaned[question.key] = await clean(question, raw[question.key], employeeId);
  const seen = { ...mine.answers, ...cleaned };
  const showing = questions.filter(question => shows(question, seen));
  const missing = showing.filter(question => question.required && !complete(question, cleaned[question.key]));
  if (missing.length) throw new ServiceError(422, "Ada pertanyaan wajib di bagian anonim yang belum dijawab.", Object.fromEntries(missing.map(question => [question.key, ["Wajib dijawab."]])));

  const rows = showing.filter(question => answered(cleaned[question.key])).map(question => ({ form_id: form.id, question_id: question.id, value: cleaned[question.key] }));
  for (let index = rows.length - 1; index > 0; index--) { const other = randomInt(index + 1); [rows[index], rows[other]] = [rows[other], rows[index]]; }

  const { error: receiptError } = await client.from("cq_anon_receipts").insert({ form_id: form.id, employee_id: employeeId });
  if (receiptError) {
    if (receiptError.code === "23505") throw new ServiceError(409, "Bagian anonim sudah kamu kirim. Bagian ini hanya bisa dikirim sekali.");
    failed(receiptError);
  }
  if (rows.length) {
    const { error } = await client.from("cq_anon_answers").insert(rows);
    if (error) {
      await client.from("cq_anon_receipts").delete().eq("form_id", form.id).eq("employee_id", employeeId);
      failed(error);
    }
  }
  const progress = progressOf(content, mine.answers, true);
  const { completedAt } = await settleProgress(form.id, employeeId, progress.done);
  return { progress, completedAt };
}
