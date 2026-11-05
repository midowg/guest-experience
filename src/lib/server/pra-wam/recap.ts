import "server-only";
import { answerLevel, type AnswerValue, type QForm, type QQuestion, type Visibility } from "@/lib/pra-wam/questionnaire";
import {
  exportable, MIN_GROUP, orderedSections, recapAccess, sectionQuestions, shareOf, shareQuestion, summarize,
  type Reader, type RecapItem, type Share,
} from "@/lib/pra-wam/recap";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { writeXlsx, type SheetOut } from "../xlsx-write";
import { listPeople } from "./appraisal";
import { answerLines } from "./hr-lock";
import { formContent, questionnaireMissing, questionnaireWaiting } from "./questionnaire";

/*
 * Rekap (charts and quotes, never a name) and Ekspor (a spreadsheet per section) of the
 * questionnaire, following src/lib/pra-wam/recap.ts for who reads what. Answers a reader may not
 * see are not even fetched: without Data HR open, `hronly` and the open `hr` questions stay in the
 * database. The route or page decides the reader (admin, Data HR open or not) and logs exports.
 */

/** One named answer, with the level it is read at (see answerLevel). */
type Row = { employee_id: string; question_id: string; value: AnswerValue; level: Visibility };

const failed = (error: { code?: string; message?: string }): never => {
  if (questionnaireMissing(error)) throw questionnaireWaiting();
  return databaseError({ message: error.message ?? "", code: error.code });
};

async function allRows<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await read(from, from + 999);
    if (error) failed(error);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/**
 * Named answers to these questions. "*" brings read_level once migration 202611050002 is in and
 * breaks nothing before it; each row is then read at the stricter of its own level and its question's.
 */
async function namedAnswers(formId: string, questionIds: string[], questions: QQuestion[]): Promise<Row[]> {
  if (!questionIds.length) return [];
  const client = createPrivilegedClient();
  const levelOf = new Map(questions.map(question => [question.id, question.visibility]));
  const rows = await allRows<Omit<Row, "level"> & { read_level?: string | null }>((from, to) => client.from("cq_answers").select("*").eq("form_id", formId)
    .in("question_id", questionIds).order("employee_id").order("question_id").range(from, to));
  return rows.map(({ employee_id, question_id, value, read_level }) => ({ employee_id, question_id, value, level: answerLevel(levelOf.get(question_id) ?? "hronly", read_level) }));
}

/** The anonymous section's answers by question. They carry no person; the order is the database's, not who sent first. */
async function anonymousAnswers(formId: string, questionIds: string[]): Promise<Map<string, AnswerValue[]>> {
  const byQuestion = new Map<string, AnswerValue[]>();
  if (!questionIds.length) return byQuestion;
  const client = createPrivilegedClient();
  const rows = await allRows<{ question_id: string; value: AnswerValue }>((from, to) => client.from("cq_anon_answers").select("question_id,value")
    .eq("form_id", formId).in("question_id", questionIds).order("id").range(from, to));
  for (const row of rows) byQuestion.set(row.question_id, [...byQuestion.get(row.question_id) ?? [], row.value]);
  return byQuestion;
}

/** Each person's sharing choice per section that has a deciding question (question 30). */
function sharesOf(questions: QQuestion[], sectionIds: string[], rows: Row[]): Map<string, Map<string, Share>> {
  const bySection = new Map<string, Map<string, Share>>();
  for (const sectionId of sectionIds) {
    const decider = shareQuestion(questions, sectionId);
    if (!decider) continue;
    const people = new Map<string, Share>();
    for (const row of rows) if (row.question_id === decider.id) people.set(row.employee_id, shareOf(row.value));
    bySection.set(sectionId, people);
  }
  return bySection;
}

/** Ids of the deciding questions, which the server reads for every reader (they hold no story, only a choice). */
const deciderIds = (questions: QQuestion[], sectionIds: string[]) =>
  sectionIds.map(sectionId => shareQuestion(questions, sectionId)?.id).filter((id): id is string => !!id);

/* ---- Rekap ------------------------------------------------------------------------------------ */

export type RecapSection = { key: string; title: string; anonymous: boolean; items: RecapItem[]; /** The anonymous section in a department view: not split. */ notSplit: boolean };
export type Recap = {
  respondents: number;
  department: string | null;
  departments: string[];
  hrOpen: boolean;
  sections: RecapSection[];
};

/** Rekap for a reader, for everyone or one department (named answers only; the anonymous section is never split). */
export async function recapOf(form: Pick<QForm, "id">, reader: Reader, department: string | null = null): Promise<Recap> {
  const [{ sections, questions }, people] = await Promise.all([formContent(form.id), listPeople()]);
  const shown = orderedSections(sections);
  const named = shown.filter(section => !section.anonymous);
  const anonymous = shown.filter(section => section.anonymous);
  const namedQuestions = named.flatMap(section => sectionQuestions(questions, section.id));
  const wanted = namedQuestions.filter(question => recapAccess(question, reader) !== "needs-hr").map(question => question.id);
  const [rows, anon] = await Promise.all([
    namedAnswers(form.id, [...new Set([...wanted, ...deciderIds(questions, named.map(section => section.id))])], questions),
    anonymousAnswers(form.id, anonymous.flatMap(section => sectionQuestions(questions, section.id)).map(question => question.id)),
  ]);

  const personById = new Map(people.map(person => [person.id, person]));
  const names = new Map(people.map(person => [person.id, person.name]));
  const answeredBy = new Set(rows.map(row => row.employee_id));
  const departments = [...new Set([...answeredBy].map(id => personById.get(id)?.department).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b, "id"));
  const chosen = department && departments.includes(department) ? department : null;
  const inGroup = (employeeId: string) => !chosen || personById.get(employeeId)?.department === chosen;
  const shares = sharesOf(questions, named.map(section => section.id), rows);
  const byQuestion = new Map<string, Row[]>();
  for (const row of rows) if (inGroup(row.employee_id)) byQuestion.set(row.question_id, [...byQuestion.get(row.question_id) ?? [], row]);

  return {
    respondents: [...answeredBy].filter(inGroup).length,
    department: chosen,
    departments,
    hrOpen: reader.hrOpen,
    sections: shown.map(section => {
      const list = sectionQuestions(questions, section.id);
      if (section.anonymous) {
        if (chosen) return { key: section.key, title: section.title, anonymous: true, items: [], notSplit: true };
        return {
          key: section.key, title: section.title, anonymous: true, notSplit: false,
          items: list.map(question => {
            const values = anon.get(question.id) ?? [];
            return summarize(question, values, { access: "full", names, small: values.length < MIN_GROUP });
          }),
        };
      }
      const sharing = shares.get(section.id);
      return {
        key: section.key, title: section.title, anonymous: false, notSplit: false,
        items: list.map(question => {
          const access = recapAccess(question, reader);
          const kept = (byQuestion.get(question.id) ?? []).filter(row => recapAccess({ visibility: row.level, kind: question.kind }, reader) !== "needs-hr").filter(row =>
            !(question.visibility === "pilih" && !reader.facilitator && (sharing?.get(row.employee_id) ?? "unnamed") === "facilitator"));
          const values = kept.map(row => row.value);
          // Counts of HR answers in one department could single someone out; so could a non-facilitator's view of `pilih`.
          const careful = (access === "counts" || question.visibility === "pilih" && !reader.facilitator) && !!chosen;
          return summarize(question, values, { access, names, small: careful && values.length < MIN_GROUP });
        }),
      };
    }),
  };
}

/* ---- Ekspor ----------------------------------------------------------------------------------- */

export type ExportPlan = { key: string; title: string; anonymous: boolean; columns: number; needsHr: number; total: number };

/** What each section's sheet will hold for this reader, for the Ekspor page. Reads no answers. */
export async function exportPlan(form: Pick<QForm, "id">, reader: Reader): Promise<ExportPlan[]> {
  const { sections, questions } = await formContent(form.id);
  return orderedSections(sections).map(section => {
    const list = sectionQuestions(questions, section.id);
    return {
      key: section.key, title: section.title, anonymous: section.anonymous, total: list.length,
      columns: section.anonymous ? list.length : list.filter(question => exportable(question, reader)).length,
      needsHr: section.anonymous ? 0 : list.filter(question => !exportable(question, reader)).length,
    };
  });
}

export type ExportResult = { file: Buffer; includesHr: boolean; sections: number };

const cell = (question: QQuestion, value: AnswerValue | undefined, names: Map<string, string>) =>
  value === undefined ? "" : answerLines(question.kind, value, names).join("; ");
const header = (question: QQuestion) => `${question.key}. ${question.prompt}`;
const scatter = (text: string) => { let hash = 2166136261; for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619); return hash >>> 0; };

/**
 * The workbook: an "Info" sheet, then per section one row per person (name, department, the
 * columns this reader may have), A to Z. In a section with a sharing question (question 30), the
 * `pilih` answers of people who did not choose "with my name" or "only the facilitator" move to
 * their own sheet without names, in a scattered order. The anonymous section is one row per answer,
 * question by question, with no person and no date, and only from MIN_GROUP sends on.
 * `only`: one section's key.
 */
export async function exportWorkbook(form: Pick<QForm, "id" | "name">, reader: Reader, only: string | null, now = new Date()): Promise<ExportResult> {
  const [{ sections, questions }, people] = await Promise.all([formContent(form.id), listPeople()]);
  const shown = orderedSections(sections).filter(section => !only || section.key === only);
  if (only && !shown.length) throw new ServiceError(404, "Bagian ini tidak ada di kuesioner.");
  const named = shown.filter(section => !section.anonymous);
  const columnsOf = new Map(named.map(section => [section.id, sectionQuestions(questions, section.id).filter(question => exportable(question, reader))]));
  const ids = [...new Set([...[...columnsOf.values()].flat().map(question => question.id), ...deciderIds(questions, named.map(section => section.id))])];
  const anonymousSections = shown.filter(section => section.anonymous);
  const [rows, anon, receipts] = await Promise.all([
    namedAnswers(form.id, ids, questions),
    anonymousAnswers(form.id, anonymousSections.flatMap(section => sectionQuestions(questions, section.id)).map(question => question.id)),
    anonymousSections.length
      ? createPrivilegedClient().from("cq_anon_receipts").select("employee_id", { count: "exact", head: true }).eq("form_id", form.id).then(result => (result.error ? failed(result.error) : result.count ?? 0))
      : Promise.resolve(0),
  ]);
  const personById = new Map(people.map(person => [person.id, person]));
  const names = new Map(people.map(person => [person.id, person.name]));
  const shares = sharesOf(questions, named.map(section => section.id), rows);
  // Only answers this reader may have per person; an answer given under a stricter level stays out.
  const readable = rows.filter(row => exportable({ visibility: row.level }, reader));
  const value = new Map(readable.map(row => [`${row.employee_id}:${row.question_id}`, row.value]));
  const hrCells = new Set(readable.filter(row => row.level === "hr" || row.level === "hronly").map(row => row.question_id));
  const notes: string[][] = [];
  const sheets: SheetOut[] = [];
  let includesHr = false;

  for (const section of shown) {
    const list = sectionQuestions(questions, section.id);
    if (section.anonymous) {
      if (receipts < MIN_GROUP) { notes.push([section.title, `Belum diekspor: baru ${receipts} kiriman, perlu minimal ${MIN_GROUP} supaya tidak bisa ditebak.`]); continue; }
      const sheetRows = [["Pertanyaan", "Jawaban"]];
      for (const question of list) {
        const lines = (anon.get(question.id) ?? []).map(item => answerLines(question.kind, item, names).join("; ")).filter(Boolean).sort((a, b) => scatter(a) - scatter(b));
        for (const line of lines) sheetRows.push([header(question), line]);
      }
      sheets.push({ name: section.title, rows: sheetRows, widths: [48, 80] });
      notes.push([section.title, `Anonim: ${receipts} kiriman, satu baris per jawaban, tanpa nama dan tanggal, urutan diacak.`]);
      continue;
    }
    const columns = columnsOf.get(section.id) ?? [];
    const left = list.length - columns.length;
    if (!columns.length) { notes.push([section.title, "Tidak diekspor: semua pertanyaannya data HR. Buka Data HR dulu."]); continue; }
    if (columns.some(question => question.visibility === "hr" || question.visibility === "hronly" || hrCells.has(question.id))) includesHr = true;
    const sharing = shares.get(section.id);
    const decider = shareQuestion(questions, section.id);
    const pilih = sharing ? columns.filter(question => question.visibility === "pilih") : [];
    const plain = columns.filter(question => !pilih.includes(question));
    const unnamedOf = (employeeId: string) => sharing && (sharing.get(employeeId) ?? "unnamed") === "unnamed";
    const filled = (employeeId: string, asked: QQuestion[]) => asked.some(question => value.has(`${employeeId}:${question.id}`));
    const everyone = [...new Set(rows.map(row => row.employee_id))].filter(id => personById.has(id))
      .sort((a, b) => personById.get(a)!.name.localeCompare(personById.get(b)!.name, "id"));

    const sheetRows = [["Nama", "Departemen", ...columns.map(header)]];
    for (const id of everyone) {
      const hide = unnamedOf(id);
      if (!filled(id, hide ? plain : columns)) continue;
      const person = personById.get(id)!;
      sheetRows.push([person.name, person.department, ...columns.map(question => (hide && pilih.includes(question) ? "" : cell(question, value.get(`${id}:${question.id}`), names)))]);
    }
    sheets.push({ name: section.title, rows: sheetRows, widths: [28, 20, ...columns.map(question => (question.kind === "long" ? 60 : 32))] });
    notes.push([section.title, `${sheetRows.length - 1} orang · ${columns.length} pertanyaan${left ? ` · ${left} pertanyaan data HR tidak ikut (Data HR terkunci)` : ""}.`]);

    if (pilih.length) {
      const unnamedRows = everyone.filter(id => unnamedOf(id) && filled(id, pilih))
        .map(id => pilih.map(question => cell(question, value.get(`${id}:${question.id}`), names)))
        .sort((a, b) => scatter(a.join("\u0000")) - scatter(b.join("\u0000")));
      if (unnamedRows.length) {
        sheets.push({ name: `${section.title} tanpa nama`, rows: [pilih.map(header), ...unnamedRows], widths: pilih.map(() => 60) });
        notes.push([`${section.title} tanpa nama`, `${unnamedRows.length} orang memilih “Dibagikan tanpa nama”${decider ? ` (pertanyaan ${decider.key})` : ""} atau belum memilih; jawabannya di sini tanpa nama, urutan diacak.`]);
      }
    }
  }

  const stamp = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(now);
  const info: SheetOut = {
    name: "Info",
    widths: [32, 100],
    rows: [
      ["Ekspor", form.name],
      ["Waktu", `${stamp} WIB`],
      ["Data HR", includesHr ? "Ikut (Data HR dibuka). Ekspor ini tercatat di log akses Data HR." : reader.hrOpen ? "Tidak ada pertanyaan data HR di bagian ini." : "Tidak ikut. Buka Data HR untuk menyertakan jawaban HR."],
      ["Rahasia", "Berisi data pribadi karyawan. Simpan di tempat yang aman dan hapus bila sudah tidak dipakai."],
      [],
      ["Bagian", "Isi"],
      ...notes,
    ],
  };
  return { file: writeXlsx([info, ...sheets]), includesHr, sections: sheets.length };
}
