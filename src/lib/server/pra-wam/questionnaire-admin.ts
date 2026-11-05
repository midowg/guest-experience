import "server-only";
import { withoutPurged } from "@/lib/pra-wam/purge";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  formStatuses, progressOf, questionKinds, slugProblem, visibilities,
  type Answers, type AnswerValue, type QForm, type QQuestion, type QSection, type QuestionKind, type ShowIf, type Visibility,
} from "@/lib/pra-wam/questionnaire";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { departmentOptions, FORM_COLUMNS, FORM_COLUMNS_BEFORE_HR_ACCESS, hrAccessMissing, questionnaireMissing, questionnaireWaiting, toForm, toQuestion } from "./questionnaire";

/*
 * Admin WAM → Kuesioner: HR edits the form's settings, its sections and its questions, and sees
 * who has filled it in. Every write is checked here (the zod schemas and the cross checks below),
 * and protects the answers already given: keys never change, a section or question with answers
 * is hidden rather than deleted, and a question's kind or anonymity cannot change under its
 * answers. Reads here are not cached, so a write and the content it returns agree.
 */

/* ---- Limits and labels ------------------------------------------------------------------------ */

export const FORM_LIMITS = { name: [2, 60], intro: 800, cardText: 200, minutes: [1, 120] } as const;
export const SECTION_LIMITS = { title: [2, 80], short: 30, hello: 120, intro: 600, tease: 160 } as const;
export const QUESTION_LIMITS = { prompt: [2, 300], placeholder: 160, note: 400, react: 160, option: 120, options: 40, rows: 20, scale: 10, maxChoices: 20 } as const;

/** The kinds that answer with options someone picks, so another question can show only for some of them. */
export const choiceKinds: readonly QuestionKind[] = ["single", "multi", "department"];
const listKinds: readonly QuestionKind[] = ["single", "multi"];
const maxKinds: readonly QuestionKind[] = ["multi", "person"];

/* ---- Schemas ---------------------------------------------------------------------------------- */

/** Line endings tidied and outer spaces dropped; single-line text also collapses its spaces. */
const tidy = (value: string) => value.replace(/\r\n?/g, "\n").trim();
const line = (value: string) => value.replace(/\s+/g, " ").trim();

const text = (label: string, max: number, min = 0, oneLine = true) => z.string({ message: `${label} harus berupa teks.` })
  .max(max * 4, `${label} paling panjang ${max} karakter.`)
  .transform(oneLine ? line : tidy)
  .pipe(min
    ? z.string().min(min, `${label} minimal ${min} karakter.`).max(max, `${label} paling panjang ${max} karakter.`)
    : z.string().max(max, `${label} paling panjang ${max} karakter.`));

const list = (label: string, max: number, itemMax: number) => z.array(z.string({ message: `${label} harus berupa teks.` }).max(itemMax * 4), { message: `${label} harus berupa daftar.` })
  .max(max * 2, `${label} paling banyak ${max}.`)
  .transform(items => items.map(line).filter(Boolean))
  .pipe(z.array(z.string().max(itemMax, `Setiap ${label.toLowerCase()} paling panjang ${itemMax} karakter.`)).max(max, `${label} paling banyak ${max}.`));

/** A date and time with its offset (the admin sends WIB, +07:00), or nothing. */
const moment = z.iso.datetime({ offset: true, message: "Tulis tanggal dan jam yang lengkap." }).nullable();

export const formSettingsSchema = z.object({
  name: text("Nama", FORM_LIMITS.name[1], FORM_LIMITS.name[0]),
  slug: z.string({ message: "Isi alamat." }).max(100, "Alamat paling panjang 40 karakter.").transform(value => value.trim().toLowerCase())
    .superRefine((slug, context) => { const problem = slugProblem(slug); if (problem) context.addIssue({ code: "custom", message: problem }); }),
  status: z.enum(formStatuses, { message: "Pilih status: draf, buka, atau tutup." }),
  intro: text("Pengantar", FORM_LIMITS.intro, 0, false),
  cardText: text("Teks kartu Beranda", FORM_LIMITS.cardText),
  minutes: z.number({ message: "Isi perkiraan menit dengan angka." }).int("Perkiraan menit harus bilangan bulat.")
    .min(FORM_LIMITS.minutes[0], `Perkiraan minimal ${FORM_LIMITS.minutes[0]} menit.`).max(FORM_LIMITS.minutes[1], `Perkiraan paling lama ${FORM_LIMITS.minutes[1]} menit.`),
  editUntil: moment,
  stayDeleteOn: z.iso.date({ message: "Pilih tanggal yang valid." }).nullable(),
}).partial().refine(patch => Object.keys(patch).length > 0, { message: "Tidak ada yang diubah.", path: ["form"] });
export type FormSettingsPatch = z.infer<typeof formSettingsSchema>;

const sectionFields = z.object({
  title: text("Judul bagian", SECTION_LIMITS.title[1], SECTION_LIMITS.title[0]),
  short: text("Nama singkat", SECTION_LIMITS.short),
  hello: text("Sapaan", SECTION_LIMITS.hello),
  intro: text("Pengantar", SECTION_LIMITS.intro, 0, false),
  tease: text("Teks penutup", SECTION_LIMITS.tease),
  anonymous: z.boolean({ message: "Pilih anonim atau tidak." }),
  hidden: z.boolean({ message: "Pilih tampil atau disembunyikan." }),
});
export const sectionCreateSchema = sectionFields.partial().required({ title: true });
export const sectionPatchSchema = sectionFields.partial().refine(patch => Object.keys(patch).length > 0, { message: "Tidak ada yang diubah.", path: ["form"] });
export type SectionFields = z.infer<typeof sectionFields>;

const showIfSchema = z.object({
  question: z.string({ message: "Pilih pertanyaan acuan." }).regex(/^[A-Za-z0-9_-]{1,20}$/, "Pilih pertanyaan acuan."),
  any: z.array(z.string().max(QUESTION_LIMITS.option)).max(QUESTION_LIMITS.options).optional(),
  not: z.array(z.string().max(QUESTION_LIMITS.option)).max(QUESTION_LIMITS.options).optional(),
}, { message: "Syarat tampil tidak dikenali." }).nullable();

const questionFields = z.object({
  sectionId: z.uuid("Pilih bagian."),
  prompt: text("Pertanyaan", QUESTION_LIMITS.prompt[1], QUESTION_LIMITS.prompt[0], false),
  kind: z.enum(questionKinds, { message: "Pilih tipe pertanyaan." }),
  required: z.boolean({ message: "Pilih wajib atau tidak." }),
  visibility: z.enum(visibilities, { message: "Pilih siapa yang bisa membaca jawabannya." }),
  options: list("Pilihan", QUESTION_LIMITS.options, QUESTION_LIMITS.option),
  maxChoices: z.number({ message: "Isi batas pilihan dengan angka." }).int("Batas pilihan harus bilangan bulat.")
    .min(1, "Batas pilihan minimal 1.").max(QUESTION_LIMITS.maxChoices, `Batas pilihan paling banyak ${QUESTION_LIMITS.maxChoices}.`).nullable(),
  matrixRows: list("Baris", QUESTION_LIMITS.rows, QUESTION_LIMITS.option),
  scale: list("Skala", QUESTION_LIMITS.scale, QUESTION_LIMITS.option),
  placeholder: text("Contoh isian", QUESTION_LIMITS.placeholder),
  note: text("Catatan", QUESTION_LIMITS.note, 0, false),
  react: text("Reaksi", QUESTION_LIMITS.react),
  showIf: showIfSchema,
  hidden: z.boolean({ message: "Pilih tampil atau disembunyikan." }),
});
export type QuestionFields = z.infer<typeof questionFields>;
export const questionCreateSchema = questionFields.partial().required({ sectionId: true, prompt: true, kind: true });
export const questionPatchSchema = questionFields.partial().refine(patch => Object.keys(patch).length > 0, { message: "Tidak ada yang diubah.", path: ["form"] });

export const orderSchema = z.union([
  z.object({ sections: z.array(z.uuid()).min(1).max(50) }),
  z.object({ sectionId: z.uuid(), questions: z.array(z.uuid()).min(1).max(300) }),
], { message: "Urutan tidak dikenali. Muat ulang halaman." });

/* ---- Pure checks ------------------------------------------------------------------------------ */

type Problems = Record<string, string[]>;
const add = (problems: Problems, path: string, message: string) => { (problems[path] ??= []).push(message); };

/** A question's fields with what its kind does not use emptied, so stale options never linger. */
export function cleanQuestion(fields: QuestionFields): QuestionFields {
  const { kind } = fields;
  const showIf = fields.showIf && {
    question: fields.showIf.question,
    ...(fields.showIf.any?.length ? { any: [...new Set(fields.showIf.any)] } : {}),
    ...(fields.showIf.not?.length ? { not: [...new Set(fields.showIf.not)] } : {}),
  };
  return {
    ...fields,
    options: listKinds.includes(kind) ? fields.options : [],
    maxChoices: maxKinds.includes(kind) ? fields.maxChoices : null,
    matrixRows: kind === "matrix" ? fields.matrixRows : [],
    scale: kind === "matrix" ? fields.scale : [],
    placeholder: kind === "text" || kind === "long" ? fields.placeholder : "",
    showIf: showIf && (showIf.any || showIf.not) ? showIf : showIf ? { question: showIf.question } : null,
  };
}

const repeats = (items: string[]) => new Set(items.map(item => item.toLowerCase())).size !== items.length;

/**
 * What is wrong with a question in its form, by field: its kind's options, who may read it given
 * its section, and its show-if rule (another question of the form, options it has, no loop).
 * `self` is the question's key, or null for a new one.
 */
export function questionProblems(
  fields: QuestionFields, self: string | null,
  form: { sections: Pick<QSection, "id" | "anonymous">[]; questions: Pick<QQuestion, "key" | "kind" | "options" | "showIf" | "sectionId">[] },
): Problems {
  const problems: Problems = {};
  const { kind } = fields;
  if (listKinds.includes(kind)) {
    if (fields.options.length < 2) add(problems, "options", "Isi minimal 2 pilihan, satu per baris.");
    else if (repeats(fields.options)) add(problems, "options", "Ada pilihan yang sama. Setiap pilihan harus berbeda.");
  }
  if (kind === "multi" && fields.maxChoices && fields.options.length >= 2 && fields.maxChoices > fields.options.length) add(problems, "maxChoices", "Batas pilihan tidak boleh lebih dari jumlah pilihan.");
  if (kind === "matrix") {
    if (!fields.matrixRows.length) add(problems, "matrixRows", "Isi minimal 1 baris, satu per baris.");
    else if (repeats(fields.matrixRows)) add(problems, "matrixRows", "Ada baris yang sama.");
    if (fields.scale.length < 2) add(problems, "scale", "Isi minimal 2 pilihan skala, satu per baris.");
    else if (repeats(fields.scale)) add(problems, "scale", "Ada pilihan skala yang sama.");
  }

  const section = form.sections.find(item => item.id === fields.sectionId);
  if (!section) add(problems, "sectionId", "Bagian ini tidak ada. Muat ulang halaman.");
  else if (section.anonymous && fields.visibility !== "anon") add(problems, "visibility", "Pertanyaan di bagian anonim harus anonim.");
  else if (!section.anonymous && fields.visibility === "anon") add(problems, "visibility", "Hanya pertanyaan di bagian anonim yang bisa anonim. Pindahkan ke bagian anonim atau pilih level lain.");

  const rule = fields.showIf;
  if (rule) {
    const target = form.questions.find(item => item.key === rule.question);
    const targetSection = target && form.sections.find(item => item.id === target.sectionId);
    if (!target) add(problems, "showIf", "Pertanyaan acuan tidak ada lagi. Pilih pertanyaan lain.");
    else if (rule.question === self) add(problems, "showIf", "Pertanyaan tidak bisa bergantung pada dirinya sendiri.");
    else if (!choiceKinds.includes(target.kind)) add(problems, "showIf", "Pertanyaan acuan harus bertipe pilihan atau departemen.");
    else if (targetSection?.anonymous && !section?.anonymous) add(problems, "showIf", "Jawaban anonim tidak bisa dipakai sebagai syarat pertanyaan bernama.");
    else {
      const picked = [...(rule.any ?? []), ...(rule.not ?? [])];
      if (!picked.length) add(problems, "showIf", "Pilih minimal satu jawaban acuan.");
      else if (target.kind !== "department" && picked.some(option => !target.options.includes(option))) add(problems, "showIf", "Ada jawaban acuan yang tidak ada di pertanyaan itu. Pilih ulang.");
      else if (self && dependsOn(rule.question, self, form.questions)) add(problems, "showIf", "Syarat ini membuat dua pertanyaan saling menunggu. Pilih pertanyaan acuan lain.");
    }
  }
  return problems;
}

/** Whether `from`, following show-if rules, ends up waiting on `on`. */
function dependsOn(from: string, on: string, questions: Pick<QQuestion, "key" | "showIf">[]): boolean {
  const seen = new Set<string>();
  for (let key: string | undefined = from; key && !seen.has(key); key = questions.find(item => item.key === key)?.showIf?.question) {
    if (key === on) return true;
    seen.add(key);
  }
  return false;
}

/** The old addresses after a move from `from` to `to`: the old one kept, the new one never listed. */
export function movedSlugs(oldSlugs: string[], from: string, to: string): string[] {
  if (from === to) return oldSlugs;
  return [...new Set([...oldSlugs, from])].filter(slug => slug !== to);
}

/** A new, unused key: "q" or "s" and six random letters or digits. */
export function newKey(prefix: "q" | "s", taken: Iterable<string>): string {
  const used = new Set(taken);
  for (;;) {
    const key = `${prefix}${randomBytes(6).toString("base64url").replace(/[-_]/g, "").slice(0, 6).toLowerCase()}`;
    if (key.length === 7 && !used.has(key)) return key;
  }
}

/* ---- Reads ------------------------------------------------------------------------------------ */

const SECTION_COLUMNS = "id,key,title,short,hello,intro,tease,anonymous,sort,hidden";
const QUESTION_COLUMNS = "id,section_id,key,prompt,kind,required,visibility,options,max_choices,matrix_rows,scale,placeholder,note,react,show_if,sort,hidden";

const fail = (error: { code?: string; message: string }): never => { if (questionnaireMissing(error)) throw questionnaireWaiting(); return databaseError(error); };

/** The form, with nothing cached; null before the migration (or without its first form). */
async function readFormOrNull(): Promise<QForm | null> {
  const read = (columns: string) => createPrivilegedClient().from("cq_forms").select(columns).order("created_at").limit(1).maybeSingle();
  let { data, error } = await read(FORM_COLUMNS);
  if (error && hrAccessMissing(error)) ({ data, error } = await read(FORM_COLUMNS_BEFORE_HR_ACCESS));
  if (error) { if (questionnaireMissing(error)) return null; databaseError(error); }
  return data ? toForm(data as unknown as Parameters<typeof toForm>[0]) : null;
}
async function readForm(): Promise<QForm> {
  const form = await readFormOrNull();
  if (!form) throw questionnaireWaiting();
  return form;
}

async function readContent(formId: string): Promise<{ sections: QSection[]; questions: QQuestion[] }> {
  const client = createPrivilegedClient();
  const [sections, questions] = await Promise.all([
    client.from("cq_sections").select(SECTION_COLUMNS).eq("form_id", formId).order("sort"),
    client.from("cq_questions").select(QUESTION_COLUMNS).eq("form_id", formId).order("sort"),
  ]);
  for (const result of [sections, questions]) if (result.error) fail(result.error);
  return { sections: (sections.data ?? []) as QSection[], questions: ((questions.data ?? []) as Parameters<typeof toQuestion>[0][]).map(toQuestion) };
}

/** How many answers (named and anonymous) a set of questions has; 0 for none. */
async function answerCount(formId: string, questionIds?: string[]): Promise<number> {
  if (questionIds && !questionIds.length) return 0;
  const client = createPrivilegedClient();
  const counts = await Promise.all(["cq_answers", "cq_anon_answers"].map(table => {
    const query = client.from(table).select("question_id", { count: "exact", head: true }).eq("form_id", formId);
    return questionIds ? query.in("question_id", questionIds) : query;
  }));
  for (const result of counts) if (result.error) fail(result.error);
  return counts.reduce((sum, result) => sum + (result.count ?? 0), 0);
}

export type AdminQuestionnaire = {
  form: QForm; sections: QSection[]; questions: QQuestion[];
  /** Whether anyone has answered yet: then deleting hides, and kinds stay. */
  answered: boolean;
  /** What a department question offers, for the preview and show-if rules. */
  departments: string[];
};

/** Everything the content and settings pages edit; null before the migration. */
export async function adminQuestionnaire(): Promise<AdminQuestionnaire | null> {
  const form = await readFormOrNull();
  if (!form) return null;
  const [content, answers, departments] = await Promise.all([readContent(form.id), answerCount(form.id), departmentOptions().catch(() => [])]);
  return { form, ...content, answered: answers > 0, departments };
}

async function fresh(): Promise<AdminQuestionnaire> {
  const result = await adminQuestionnaire();
  if (!result) throw questionnaireWaiting();
  return result;
}

/* ---- Writes: the form ------------------------------------------------------------------------- */

/** Name, address, status, texts and dates. A new address keeps the old one redirecting. */
export async function saveFormSettings(patch: FormSettingsPatch): Promise<{ result: AdminQuestionnaire; message: string }> {
  const form = await readForm();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.slug !== undefined && patch.slug !== form.slug) { row.slug = patch.slug; row.old_slugs = movedSlugs(form.oldSlugs, form.slug, patch.slug); }
  if (patch.status !== undefined) {
    if (patch.status === "buka" && form.status !== "buka") {
      const { sections, questions } = await readContent(form.id);
      const shown = sections.filter(section => !section.hidden).map(section => section.id);
      if (!questions.some(question => !question.hidden && shown.includes(question.sectionId))) throw new ServiceError(409, "Belum ada pertanyaan yang tampil. Tambahkan atau tampilkan pertanyaan dulu, lalu buka kuesioner.");
    }
    row.status = patch.status;
  }
  if (patch.intro !== undefined) row.intro = patch.intro;
  if (patch.cardText !== undefined) row.card_text = patch.cardText;
  if (patch.minutes !== undefined) row.minutes = patch.minutes;
  if (patch.editUntil !== undefined) row.edit_until = patch.editUntil;
  if (patch.stayDeleteOn !== undefined) row.stay_delete_on = patch.stayDeleteOn;
  const { error } = await createPrivilegedClient().from("cq_forms").update(row).eq("id", form.id);
  if (error) {
    if (error.code === "23505") throw new ServiceError(409, "Alamat ini sudah dipakai. Pilih alamat lain.", { slug: ["Alamat ini sudah dipakai. Pilih alamat lain."] });
    fail(error);
  }
  const statusWord = { draf: "Kuesioner disimpan sebagai draf.", buka: "Kuesioner dibuka untuk semua peserta.", tutup: "Kuesioner ditutup." } as const;
  const message = patch.status !== undefined && patch.status !== form.status ? statusWord[patch.status]
    : row.slug ? `Disimpan. Alamat baru /wam/${patch.slug}; alamat lama tetap dialihkan.` : "Pengaturan kuesioner disimpan.";
  return { result: await fresh(), message };
}

/* ---- Writes: sections ------------------------------------------------------------------------- */

export async function createSection(input: z.infer<typeof sectionCreateSchema>): Promise<AdminQuestionnaire> {
  const form = await readForm();
  const { sections } = await readContent(form.id);
  const client = createPrivilegedClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await client.from("cq_sections").insert({
      form_id: form.id, key: newKey("s", sections.map(section => section.key)), title: input.title, short: input.short ?? "", hello: input.hello ?? "",
      intro: input.intro ?? "", tease: input.tease ?? "", anonymous: input.anonymous ?? false, hidden: input.hidden ?? false,
      sort: Math.max(0, ...sections.map(section => section.sort)) + 1,
    });
    if (!error) return fresh();
    if (error.code !== "23505") fail(error);
  }
  throw new ServiceError(409, "Bagian belum bisa ditambah. Coba lagi.");
}

export async function updateSection(id: string, patch: Partial<SectionFields>): Promise<AdminQuestionnaire> {
  const form = await readForm();
  const { sections, questions } = await readContent(form.id);
  const section = sections.find(item => item.id === id);
  if (!section) throw new ServiceError(404, "Bagian ini tidak ada lagi. Muat ulang halaman.");
  const own = questions.filter(question => question.sectionId === id);
  if (patch.anonymous !== undefined && patch.anonymous !== section.anonymous) {
    if (await answerCount(form.id, own.map(question => question.id))) throw new ServiceError(409, "Bagian ini sudah punya jawaban, jadi sifat anonimnya tidak bisa diubah.", { anonymous: ["Sudah ada jawaban; anonim tidak bisa diubah."] });
    const wrong = own.filter(question => (question.visibility === "anon") !== patch.anonymous);
    if (wrong.length) throw new ServiceError(409, patch.anonymous
      ? `Ubah dulu level baca ${wrong.length} pertanyaan di bagian ini menjadi Anonim.`
      : `Ubah dulu level baca ${wrong.length} pertanyaan anonim di bagian ini.`, { anonymous: ["Level baca pertanyaannya belum sesuai."] });
  }
  const { error } = await createPrivilegedClient().from("cq_sections").update(patch).eq("id", id).eq("form_id", form.id);
  if (error) fail(error);
  return fresh();
}

/** Removes a section and its questions, or hides it once any of them has answers. */
export async function removeSection(id: string): Promise<{ result: AdminQuestionnaire; hidden: boolean }> {
  const form = await readForm();
  const { sections, questions } = await readContent(form.id);
  if (!sections.some(item => item.id === id)) throw new ServiceError(404, "Bagian ini tidak ada lagi. Muat ulang halaman.");
  const own = questions.filter(question => question.sectionId === id);
  const client = createPrivilegedClient();
  if (await answerCount(form.id, own.map(question => question.id))) {
    const { error } = await client.from("cq_sections").update({ hidden: true }).eq("id", id);
    if (error) fail(error);
    return { result: await fresh(), hidden: true };
  }
  const ownKeys = new Set(own.map(question => question.key));
  const waiting = questions.filter(question => question.sectionId !== id && question.showIf && ownKeys.has(question.showIf.question));
  if (waiting.length) throw new ServiceError(409, `Pertanyaan ${waiting.map(question => question.key).join(", ")} bergantung pada pertanyaan di bagian ini. Ubah syarat tampilnya dulu.`);
  const { error } = await client.from("cq_sections").delete().eq("id", id).eq("form_id", form.id);
  if (error) fail(error);
  return { result: await fresh(), hidden: false };
}

/* ---- Writes: questions ------------------------------------------------------------------------ */

const toRow = (fields: QuestionFields) => ({
  section_id: fields.sectionId, prompt: fields.prompt, kind: fields.kind, required: fields.required, visibility: fields.visibility as Visibility,
  options: fields.options, max_choices: fields.maxChoices, matrix_rows: fields.matrixRows, scale: fields.scale,
  placeholder: fields.placeholder, note: fields.note, react: fields.react, show_if: fields.showIf as ShowIf | null, hidden: fields.hidden,
});

const reject = (problems: Problems) => { if (Object.keys(problems).length) throw new ServiceError(422, "Periksa kembali isian pertanyaan.", problems); };

export async function createQuestion(input: z.infer<typeof questionCreateSchema>): Promise<{ result: AdminQuestionnaire; id: string }> {
  const form = await readForm();
  const content = await readContent(form.id);
  const section = content.sections.find(item => item.id === input.sectionId);
  const fields = cleanQuestion({
    sectionId: input.sectionId, prompt: input.prompt, kind: input.kind, required: input.required ?? false,
    visibility: input.visibility ?? (section?.anonymous ? "anon" : "fasil"), options: input.options ?? [], maxChoices: input.maxChoices ?? null,
    matrixRows: input.matrixRows ?? [], scale: input.scale ?? [], placeholder: input.placeholder ?? "", note: input.note ?? "",
    react: input.react ?? "", showIf: input.showIf ?? null, hidden: input.hidden ?? false,
  });
  reject(questionProblems(fields, null, content));
  const sort = Math.max(0, ...content.questions.filter(question => question.sectionId === fields.sectionId).map(question => question.sort)) + 1;
  const client = createPrivilegedClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await client.from("cq_questions")
      .insert({ form_id: form.id, key: newKey("q", content.questions.map(question => question.key)), sort, ...toRow(fields) }).select("id").single();
    if (!error) return { result: await fresh(), id: (data as { id: string }).id };
    if (error.code !== "23505") fail(error);
  }
  throw new ServiceError(409, "Pertanyaan belum bisa ditambah. Coba lagi.");
}

const fieldsOf = (question: QQuestion): QuestionFields => ({
  sectionId: question.sectionId, prompt: question.prompt, kind: question.kind, required: question.required, visibility: question.visibility,
  options: question.options, maxChoices: question.maxChoices, matrixRows: question.matrixRows, scale: question.scale,
  placeholder: question.placeholder, note: question.note, react: question.react, showIf: question.showIf, hidden: question.hidden,
});

/** A question's fields, a move to another section included (it goes to that section's end). Its key never changes. */
export async function updateQuestion(id: string, patch: Partial<QuestionFields>): Promise<AdminQuestionnaire> {
  const form = await readForm();
  const content = await readContent(form.id);
  const question = content.questions.find(item => item.id === id);
  if (!question) throw new ServiceError(404, "Pertanyaan ini tidak ada lagi. Muat ulang halaman.");
  const fields = cleanQuestion({ ...fieldsOf(question), ...patch });
  reject(questionProblems(fields, question.key, content));

  const moved = fields.sectionId !== question.sectionId;
  const from = content.sections.find(section => section.id === question.sectionId);
  const to = content.sections.find(section => section.id === fields.sectionId);
  if ((fields.kind !== question.kind || (moved && from?.anonymous !== to?.anonymous)) && await answerCount(form.id, [id])) {
    reject(fields.kind !== question.kind
      ? { kind: ["Sudah ada jawaban, jadi tipenya tidak bisa diubah. Buat pertanyaan baru lalu sembunyikan yang ini."] }
      : { sectionId: ["Sudah ada jawaban, jadi pertanyaan ini tidak bisa pindah antara bagian anonim dan bernama."] });
  }
  const row: Record<string, unknown> = toRow(fields);
  if (moved) row.sort = Math.max(0, ...content.questions.filter(item => item.sectionId === fields.sectionId).map(item => item.sort)) + 1;
  const { error } = await createPrivilegedClient().from("cq_questions").update(row).eq("id", id).eq("form_id", form.id);
  if (error) fail(error);
  return fresh();
}

/** Removes a question, or hides it once it has answers. A question others wait on stays. */
export async function removeQuestion(id: string): Promise<{ result: AdminQuestionnaire; hidden: boolean }> {
  const form = await readForm();
  const { questions } = await readContent(form.id);
  const question = questions.find(item => item.id === id);
  if (!question) throw new ServiceError(404, "Pertanyaan ini tidak ada lagi. Muat ulang halaman.");
  const client = createPrivilegedClient();
  if (await answerCount(form.id, [id])) {
    const { error } = await client.from("cq_questions").update({ hidden: true }).eq("id", id);
    if (error) fail(error);
    return { result: await fresh(), hidden: true };
  }
  const waiting = questions.filter(item => item.showIf?.question === question.key);
  if (waiting.length) throw new ServiceError(409, `Pertanyaan ${waiting.map(item => item.key).join(", ")} bergantung pada pertanyaan ini. Ubah syarat tampilnya dulu.`);
  const { error } = await client.from("cq_questions").delete().eq("id", id).eq("form_id", form.id);
  if (error) fail(error);
  return { result: await fresh(), hidden: false };
}

/** A new order: every section of the form, or every question of one section, exactly once. */
export async function saveOrder(order: z.infer<typeof orderSchema>): Promise<AdminQuestionnaire> {
  const form = await readForm();
  const { sections, questions } = await readContent(form.id);
  const [table, ids, current] = "sections" in order
    ? ["cq_sections", order.sections, sections.map(section => section.id)] as const
    : ["cq_questions", order.questions, questions.filter(question => question.sectionId === order.sectionId).map(question => question.id)] as const;
  if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some(id => !current.includes(id))) throw new ServiceError(409, "Urutan sudah berubah di tempat lain. Muat ulang halaman, lalu coba lagi.");
  const client = createPrivilegedClient();
  const results = await Promise.all(ids.map((id, index) => client.from(table).update({ sort: index + 1 }).eq("id", id).eq("form_id", form.id)));
  for (const result of results) if (result.error) fail(result.error);
  return fresh();
}

/* ---- Progress --------------------------------------------------------------------------------- */

export type ProgressState = "belum" | "sedang" | "selesai";
export type PersonProgress = {
  employeeId: string; name: string; department: string; state: ProgressState;
  sectionsDone: number; sectionsTotal: number; lastActivity: string | null;
};
export type ProgressReport = {
  formName: string; sectionsTotal: number;
  counts: Record<ProgressState, number>;
  departments: { name: string; counts: Record<ProgressState, number>; total: number }[];
  people: PersonProgress[];
};

type ProgressRow = { employee_id: string; consent_at: string | null; completed_at: string | null; updated_at: string };
type AnswerRow = { employee_id: string; question_id: string; value: AnswerValue; updated_at: string };

/** Every row of a select, a thousand at a time (PostgREST's page limit). */
async function allRows<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await read(from, from + 999);
    if (error) fail(error);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Who has started and finished, for every active employee: the sections done come from their
 * named answers and, for the anonymous section, only its receipt (whose date is not shown, so it
 * cannot be lined up with the anonymous answers). Done means every shown section is done today,
 * so a new required question puts people back to "sedang".
 */
export function progressReport(
  input: { formName: string; sections: QSection[]; questions: QQuestion[]; people: { id: string; name: string; department: string }[]; progress: ProgressRow[]; answers: AnswerRow[]; receipts: string[] },
): ProgressReport {
  const keyOf = new Map(input.questions.map(question => [question.id, question.key]));
  const byPerson = new Map<string, { answers: Answers; last: string | null }>();
  for (const row of input.answers) {
    const key = keyOf.get(row.question_id);
    if (!key) continue;
    const entry = byPerson.get(row.employee_id) ?? { answers: {}, last: null };
    entry.answers[key] = row.value;
    entry.last = later(entry.last, row.updated_at);
    byPerson.set(row.employee_id, entry);
  }
  const progressOfPerson = new Map(input.progress.map(row => [row.employee_id, row]));
  const receipts = new Set(input.receipts);
  const content = { sections: input.sections, questions: input.questions };
  const empty = (): Record<ProgressState, number> => ({ belum: 0, sedang: 0, selesai: 0 });
  const counts = empty();
  const departments = new Map<string, Record<ProgressState, number>>();
  let sectionsTotal = progressOf(content, {}, false).sectionsTotal;

  const people = input.people.map(person => {
    const entry = byPerson.get(person.id);
    const row = progressOfPerson.get(person.id);
    const progress = progressOf(content, entry?.answers ?? {}, receipts.has(person.id));
    sectionsTotal = Math.max(sectionsTotal, progress.sectionsTotal);
    const started = !!row || !!entry || receipts.has(person.id);
    const state: ProgressState = progress.done ? "selesai" : started ? "sedang" : "belum";
    counts[state]++;
    const department = person.department || "Tanpa departemen";
    const tally = departments.get(department) ?? empty();
    tally[state]++;
    departments.set(department, tally);
    return {
      employeeId: person.id, name: person.name, department, state,
      sectionsDone: progress.sectionsDone, sectionsTotal: progress.sectionsTotal,
      lastActivity: later(later(entry?.last ?? null, row?.updated_at ?? null), row?.completed_at ?? null),
    };
  });
  return {
    formName: input.formName, sectionsTotal, counts,
    departments: [...departments].map(([name, tally]) => ({ name, counts: tally, total: tally.belum + tally.sedang + tally.selesai })).sort((a, b) => a.name.localeCompare(b.name, "id")),
    people: people.sort((a, b) => a.name.localeCompare(b.name, "id")),
  };
}

/** The progress page; null before the migration. */
export async function questionnaireProgress(): Promise<ProgressReport | null> {
  const form = await readFormOrNull();
  if (!form) return null;
  const client = createPrivilegedClient();
  const [content, people, progress, answers, receipts] = await Promise.all([
    readContent(form.id),
    listPeople(),
    allRows<ProgressRow>((from, to) => client.from("cq_progress").select("employee_id,consent_at,completed_at,updated_at").eq("form_id", form.id).order("employee_id").range(from, to)),
    allRows<AnswerRow>((from, to) => client.from("cq_answers").select("employee_id,question_id,value,updated_at").eq("form_id", form.id).order("employee_id").order("question_id").range(from, to)),
    allRows<{ employee_id: string }>((from, to) => client.from("cq_anon_receipts").select("employee_id").eq("form_id", form.id).order("employee_id").range(from, to)),
  ]);
  return progressReport({
    // From the stay date, the deleted questions count for no one (see purge.ts).
    formName: form.name, ...withoutPurged(content, form), progress, answers, receipts: receipts.map(row => row.employee_id),
    people: people.filter(person => person.active).map(({ id, name, department }) => ({ id, name, department })),
  });
}
