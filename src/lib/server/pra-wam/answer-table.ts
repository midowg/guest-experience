import "server-only";
import { withoutPurged } from "@/lib/pra-wam/purge";
import { answered, type AnswerValue, type QForm, type QQuestion, type Visibility } from "@/lib/pra-wam/questionnaire";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { answerLines } from "./hr-lock";
import { formContent, questionnaireMissing, questionnaireWaiting } from "./questionnaire";
import { questionnaireProgress, type ProgressState } from "./questionnaire-admin";

/*
 * Admin WAM → Kuesioner → Rekap (11 Nov 2026, owner's decision): one table, one row per person
 * the questionnaire is for, one column per named question, every answer as text, HR and Rahasia
 * included (every admin sees everything). The anonymous section is never here: its answers are kept
 * without a name. The same rows make the Excel download.
 */

export type TableColumn = {
  key: string; number: number; prompt: string; section: string; sectionId: string; visibility: Visibility;
};
export type TableRow = {
  id: string; name: string; department: string; state: ProgressState; sectionsDone: number; sectionsTotal: number;
  lastActivity: string | null;
  /** Answer text by question key; absent when not answered. */
  cells: Record<string, string>;
};
export type AnswerTable = {
  formName: string; columns: TableColumn[]; rows: TableRow[];
  sections: { id: string; title: string }[];
  counts: Record<ProgressState, number>;
  /** People answers exist for who are left out (not active, or not chosen). */
  outside: number;
};

/** An answer as one cell: choices joined with commas, people by name, a matrix as "row: choice". */
export const cellText = (question: Pick<QQuestion, "kind">, value: AnswerValue, names: Map<string, string>): string =>
  answerLines(question.kind, value, names).join(question.kind === "matrix" || question.kind === "long" ? "\n" : ", ");

/** The table; null before the migration. */
export async function answerTable(form: QForm): Promise<AnswerTable | null> {
  const report = await questionnaireProgress();
  if (!report) return null;
  const content = withoutPurged(await formContent(form.id), form);
  const sections = [...content.sections].filter(section => !section.hidden && !section.anonymous).sort((a, b) => a.sort - b.sort);
  const titles = new Map(sections.map(section => [section.id, section.title]));
  const questions = content.questions.filter(question => !question.hidden && titles.has(question.sectionId) && question.visibility !== "anon")
    .sort((a, b) => sections.findIndex(section => section.id === a.sectionId) - sections.findIndex(section => section.id === b.sectionId) || a.sort - b.sort);
  const columns: TableColumn[] = questions.map((question, index) => ({
    key: question.key, number: index + 1, prompt: question.prompt, section: titles.get(question.sectionId) ?? "", sectionId: question.sectionId, visibility: question.visibility,
  }));

  const byId = new Map(questions.map(question => [question.id, question]));
  const answers = new Map<string, Record<string, AnswerValue>>();
  const client = createPrivilegedClient();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await client.from("cq_answers").select("employee_id,question_id,value").eq("form_id", form.id)
      .order("employee_id").order("question_id").range(from, from + page - 1);
    if (error) { if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
    for (const row of data ?? []) {
      const question = byId.get(row.question_id as string);
      if (!question || !answered(row.value as AnswerValue)) continue;
      answers.set(row.employee_id as string, { ...(answers.get(row.employee_id as string) ?? {}), [question.key]: row.value as AnswerValue });
    }
    if ((data?.length ?? 0) < page) break;
  }

  const people = await listPeople();
  const names = new Map(people.map(person => [person.id, person.fullName]));
  const kinds = new Map(questions.map(question => [question.key, question]));
  const rows: TableRow[] = report.people.map(person => {
    const given = answers.get(person.employeeId) ?? {};
    const cells: Record<string, string> = {};
    for (const [key, value] of Object.entries(given)) {
      const question = kinds.get(key);
      if (question) cells[key] = cellText(question, value, names);
    }
    return {
      id: person.employeeId, name: names.get(person.employeeId) ?? person.name, department: person.department, state: person.state,
      sectionsDone: person.sectionsDone, sectionsTotal: person.sectionsTotal, lastActivity: person.lastActivity, cells,
    };
  });
  const inside = new Set(rows.map(row => row.id));
  const outside = [...answers.keys()].filter(id => !inside.has(id)).length;
  return { formName: form.name, columns, rows, sections: sections.map(({ id, title }) => ({ id, title })), counts: report.counts, outside };
}

/** The table as an Excel sheet: who, then every question, in the order on screen. */
export function tableSheet(table: AnswerTable): string[][] {
  const states: Record<ProgressState, string> = { selesai: "Selesai", sedang: "Sedang mengisi", belum: "Belum mulai" };
  return [
    ["Nama", "Departemen", "Status", ...table.columns.map(column => `${column.number}. ${column.prompt}`)],
    ...table.rows.map(row => [row.name, row.department, states[row.state], ...table.columns.map(column => row.cells[column.key] ?? "")]),
  ];
}
