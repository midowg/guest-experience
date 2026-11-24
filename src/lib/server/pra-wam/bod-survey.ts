import "server-only";
import { answered, type AnswerValue, type QForm, type QQuestion, type Visibility } from "@/lib/pra-wam/questionnaire";
import { MIN_GROUP, orderedSections, sectionQuestions, shareQuestion, type Reader, type Share } from "@/lib/pra-wam/recap";
import type { BodPersonAnswers, BodSurvey } from "@/lib/pra-wam/bod-survey";
import { ServiceError } from "../config";
import { writeXlsx, type SheetOut } from "../xlsx-write";
import { listPeople } from "./appraisal";
import { answerLines } from "./hr-lock";
import { currentForm, formContent, questionnaireWaiting } from "./questionnaire";
import { questionnaireProgress } from "./questionnaire-admin";
import { deciderIds, namedAnswers, recapOf, sharesOf } from "./recap";
import type { Member } from "./session";

/*
 * Data kuesioner for BoD (24 Nov 2026, owner's request: "card khusus untuk BOD semua data
 * kuesioner"). Two kinds of reading, each following what the person saw next to the question:
 * - Ringkasan (charts and quotes, never a name): Rekap's own rules for a reader who is neither HR
 *   nor facilitator (src/lib/pra-wam/recap.ts): HR questions as counts only, Rahasia not at all,
 *   "only the facilitator" answers left out, the anonymous section from MIN_GROUP sends on.
 * - Per person (Orang, Export "Semua jawaban"): only answers whose label names BoD: "Rekan bisa
 *   lihat ini" and "HR, manajemen, dan admin WAM", and a `pilih` answer its owner shared with their
 *   name. Panitia-only, Rahasia and anonymous answers never appear with a name here.
 */

export const bodReader: Reader = { hrOpen: false, facilitator: false };

/** Whether BoD may read this answer next to the person's name. */
export function bodReadsNamed(level: Visibility, share: Share | undefined): boolean {
  if (level === "rekan" || level === "hr") return true;
  if (level === "pilih") return share === "named";
  return false;
}

export function requireBod(member: Pick<Member, "roles">) {
  if (!member.roles.includes("bod") && !member.roles.includes("admin")) throw new ServiceError(403, "Data kuesioner hanya untuk BoD.");
}

async function openForm(): Promise<QForm> {
  const form = await currentForm();
  if (!form) throw questionnaireWaiting();
  if (form.status === "draf") throw new ServiceError(404, "Kuesioner belum dibuka.");
  return form;
}

/** The screen: who finished, by department, and every question summed up. */
export async function bodSurvey(member: Member): Promise<BodSurvey> {
  requireBod(member);
  const form = await openForm();
  const [progress, recap] = await Promise.all([questionnaireProgress(), recapOf(form, bodReader)]);
  if (!progress) throw questionnaireWaiting();
  return {
    formName: form.name, editUntil: form.editUntil,
    counts: progress.counts,
    people: progress.people,
    departments: progress.departments,
    sections: recap.sections,
  };
}

/** One person's answers BoD may read, by section; empty sections are left out. */
export async function bodPersonAnswers(member: Member, employeeId: string): Promise<BodPersonAnswers> {
  requireBod(member);
  const form = await openForm();
  const [{ sections, questions }, people] = await Promise.all([formContent(form.id), listPeople()]);
  const person = people.find(item => item.id === employeeId);
  if (!person) throw new ServiceError(404, "Orang ini tidak ditemukan.");
  const named = orderedSections(sections).filter(section => !section.anonymous);
  const list = named.flatMap(section => sectionQuestions(questions, section.id));
  const rows = (await namedAnswers(form.id, [...new Set([...list.map(question => question.id), ...deciderIds(questions, named.map(section => section.id))])], questions))
    .filter(row => row.employee_id === employeeId);
  const shares = sharesOf(questions, named.map(section => section.id), rows);
  const names = new Map(people.map(item => [item.id, item.name]));
  const valueOf = new Map(rows.map(row => [row.question_id, row]));
  return {
    name: person.name, department: person.department,
    sections: named.map(section => ({
      title: section.title,
      answers: sectionQuestions(questions, section.id).flatMap(question => {
        const row = valueOf.get(question.id);
        if (!row || !answered(row.value) || shareQuestion(questions, section.id)?.id === question.id) return [];
        if (!bodReadsNamed(row.level, shares.get(section.id)?.get(employeeId))) return [];
        return [{ prompt: question.prompt, answer: answerLines(question.kind, row.value, names).join(question.kind === "long" || question.kind === "matrix" ? "\n" : ", "), level: row.level }];
      }),
    })).filter(section => section.answers.length > 0),
  };
}

const header = (question: QQuestion) => `${question.key}. ${question.prompt}`;
const stamp = (now: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(now);

/** Export "Semua jawaban": per section one row per person, only answers BoD may read with a name. */
async function answersWorkbook(form: QForm, now: Date): Promise<Buffer> {
  const [{ sections, questions }, people] = await Promise.all([formContent(form.id), listPeople()]);
  const named = orderedSections(sections).filter(section => !section.anonymous);
  const list = named.flatMap(section => sectionQuestions(questions, section.id));
  const rows = await namedAnswers(form.id, [...new Set([...list.map(question => question.id), ...deciderIds(questions, named.map(section => section.id))])], questions);
  const shares = sharesOf(questions, named.map(section => section.id), rows);
  const names = new Map(people.map(person => [person.id, person.name]));
  const personById = new Map(people.map(person => [person.id, person]));
  const sheets: SheetOut[] = [];
  const notes: string[][] = [];
  for (const section of named) {
    const decider = shareQuestion(questions, section.id);
    const columns = sectionQuestions(questions, section.id).filter(question => question.id !== decider?.id && (question.visibility === "rekan" || question.visibility === "hr" || question.visibility === "pilih"));
    const left = sectionQuestions(questions, section.id).length - columns.length - (decider ? 1 : 0);
    if (!columns.length) { notes.push([section.title, "Tidak ikut: pertanyaannya hanya untuk panitia atau HR."]); continue; }
    const value = new Map<string, string>();
    for (const row of rows) {
      const question = columns.find(item => item.id === row.question_id);
      if (!question || !answered(row.value) || !bodReadsNamed(row.level, shares.get(section.id)?.get(row.employee_id))) continue;
      value.set(`${row.employee_id}:${question.id}`, answerLines(question.kind, row.value as AnswerValue, names).join("; "));
    }
    const everyone = [...new Set(rows.map(row => row.employee_id))].filter(id => personById.has(id) && columns.some(question => value.has(`${id}:${question.id}`)))
      .sort((a, b) => personById.get(a)!.name.localeCompare(personById.get(b)!.name, "id"));
    sheets.push({
      name: section.title, widths: [28, 20, ...columns.map(question => (question.kind === "long" ? 60 : 32))],
      rows: [["Nama", "Departemen", ...columns.map(header)], ...everyone.map(id => [personById.get(id)!.name, personById.get(id)!.department, ...columns.map(question => value.get(`${id}:${question.id}`) ?? "")])],
    });
    notes.push([section.title, `${everyone.length} orang · ${columns.length} pertanyaan${left > 0 ? ` · ${left} pertanyaan untuk panitia atau HR saja tidak ikut` : ""}.`]);
  }
  return writeXlsx([{
    name: "Info", widths: [32, 100],
    rows: [["Ekspor", `${form.name} · semua jawaban untuk BoD`], ["Waktu", `${stamp(now)} WIB`],
      ["Isi", "Jawaban yang boleh dibaca BoD dengan nama: Rekan, HR dan manajemen, dan pilihan yang dibagikan dengan nama. Jawaban untuk panitia saja, Rahasia, dan bagian tanpa nama tidak ikut."],
      ["Rahasia", "Berisi data pribadi karyawan. Simpan di tempat yang aman dan hapus bila sudah tidak dipakai."], [], ["Bagian", "Isi"], ...notes],
  }, ...sheets]);
}

/** Export "Ringkasan": every question summed up as on the screen, no names. */
async function summaryWorkbook(form: QForm, now: Date): Promise<Buffer> {
  const recap = await recapOf(form, bodReader);
  const rows: string[][] = [["Bagian", "Pertanyaan", "Jawaban", "Jumlah"]];
  for (const section of recap.sections) for (const item of section.items) {
    const body = item.body;
    if (body.type === "bars") for (const bar of body.bars) rows.push([section.title, item.prompt, bar.label, String(bar.count)]);
    else if (body.type === "matrix") for (const row of body.rows) row.counts.forEach((count, i) => rows.push([section.title, `${item.prompt} · ${row.label}`, body.scale[i], String(count)]));
    else if (body.type === "quotes") for (const quote of body.quotes) rows.push([section.title, item.prompt, quote.text, String(quote.count)]);
    else rows.push([section.title, item.prompt, body.type === "needs-hr" ? "Hanya untuk HR" : body.type === "few" ? `Belum ditampilkan: kurang dari ${MIN_GROUP} jawaban` : "Belum ada jawaban", ""]);
  }
  return writeXlsx([
    { name: "Info", widths: [32, 100], rows: [["Ekspor", `${form.name} · ringkasan untuk BoD`], ["Waktu", `${stamp(now)} WIB`], ["Isi", "Jumlah tiap jawaban, tanpa nama. Pertanyaan HR hanya angka; Rahasia tidak ikut; bagian tanpa nama mulai 5 kiriman."]] },
    { name: "Ringkasan", widths: [24, 60, 60, 10], rows },
  ]);
}

export async function bodSurveyExport(member: Member, isi: "jawaban" | "ringkasan", now = new Date()): Promise<{ file: Buffer; name: string }> {
  requireBod(member);
  const form = await openForm();
  const file = isi === "jawaban" ? await answersWorkbook(form, now) : await summaryWorkbook(form, now);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  return { file, name: `${form.slug}-${isi}-bod-${day}.xlsx` };
}
