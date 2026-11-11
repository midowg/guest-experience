import "server-only";
import { cache } from "react";
import type { FormStatus, QContent, QForm, QQuestion, QSection, QuestionKind, ShowIf, Visibility } from "@/lib/pra-wam/questionnaire";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";

/*
 * Reading the personal questionnaire (migration 202611040011): the form, its sections and
 * questions, and the lists its department and person questions choose from. Writing content lives
 * with the admin; answers with the app. Before the migration everything reads as "no form".
 */

export const QUESTIONNAIRE_MIGRATION = "202611040011_wam_questionnaire.sql";
export const questionnaireMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /cq_(forms|sections|questions|answers|progress|anon|hr_access)/.test(error.message ?? "");
export const questionnaireWaiting = () => new ServiceError(503, `Kuesioner menunggu migrasi ${QUESTIONNAIRE_MIGRATION}.`);

type FormRow = {
  id: string; name: string; slug: string; old_slugs: string[]; status: FormStatus; intro: string; card_text: string; minutes: number;
  edit_until: string | null; stay_delete_on: string | null; hr_access?: string[] | null; audience?: string | null; audience_ids?: string[] | null;
};
/** Without hr_access: the columns before migration 202611040012, read as "nobody has HR access". */
export const FORM_COLUMNS_BEFORE_HR_ACCESS = "id,name,slug,old_slugs,status,intro,card_text,minutes,edit_until,stay_delete_on";
/** Without audience: the columns before migration 202611110001, read as "for everyone". */
export const FORM_COLUMNS_BEFORE_AUDIENCE = `${FORM_COLUMNS_BEFORE_HR_ACCESS},hr_access`;
export const FORM_COLUMNS = `${FORM_COLUMNS_BEFORE_AUDIENCE},audience,audience_ids`;
/** cq_forms.hr_access is missing (before migration 202611040012); not cq_hr_access_log, which is older. */
export const hrAccessMissing = (error: { code?: string; message?: string }) =>
  ["42703", "PGRST204"].includes(error.code ?? "") && /\bhr_access\b/.test(error.message ?? "");
/** cq_forms.audience or audience_ids is missing (before migration 202611110001). */
export const audienceMissing = (error: { code?: string; message?: string }) =>
  ["42703", "PGRST204"].includes(error.code ?? "") && /\baudience(_ids)?\b/.test(error.message ?? "");

export const toForm = (row: FormRow): QForm => ({
  id: row.id, name: row.name, slug: row.slug, oldSlugs: row.old_slugs ?? [], status: row.status, intro: row.intro, cardText: row.card_text,
  minutes: row.minutes, editUntil: row.edit_until, stayDeleteOn: row.stay_delete_on, hrAccess: row.hr_access ?? [],
  audience: row.audience === "pilih" ? "pilih" : "semua", audienceIds: row.audience_ids ?? [],
});

/** Reads the one form with the newest columns the database has; null data before the first migration. */
export async function readFormRow(): Promise<{ data: FormRow | null; error: { code?: string; message: string } | null }> {
  const read = (columns: string) => createPrivilegedClient().from("cq_forms").select(columns).order("created_at").limit(1).maybeSingle();
  let { data, error } = await read(FORM_COLUMNS);
  if (error && audienceMissing(error)) ({ data, error } = await read(FORM_COLUMNS_BEFORE_AUDIENCE));
  if (error && hrAccessMissing(error)) ({ data, error } = await read(FORM_COLUMNS_BEFORE_HR_ACCESS));
  return { data: data as unknown as FormRow | null, error };
}

/** Whether cq_forms has the audience columns (migration 202611110001), so people can be chosen. */
export async function audienceReady(): Promise<boolean> {
  const { error } = await createPrivilegedClient().from("cq_forms").select("audience,audience_ids").limit(1);
  return !error;
}

/** The questionnaire (there is one); null before the migration. */
async function currentFormUncached(): Promise<QForm | null> {
  const { data, error } = await readFormRow();
  if (error) { if (questionnaireMissing(error)) return null; databaseError(error); }
  return data ? toForm(data) : null;
}
export const currentForm = cache(currentFormUncached);

/** The form at an address under /wam: its own slug, or an old one that should redirect. */
export async function formAt(slug: string): Promise<{ form: QForm; moved: boolean } | null> {
  const form = await currentForm();
  if (!form) return null;
  if (form.slug === slug) return { form, moved: false };
  if (form.oldSlugs.includes(slug)) return { form, moved: true };
  return null;
}

type SectionRow = { id: string; key: string; title: string; short: string; hello: string; intro: string; tease: string; anonymous: boolean; sort: number; hidden: boolean };
type QuestionRow = {
  id: string; section_id: string; key: string; prompt: string; kind: QuestionKind; required: boolean; visibility: Visibility; options: string[];
  max_choices: number | null; matrix_rows: string[]; scale: string[]; placeholder: string; note: string; react: string; show_if: ShowIf | null; sort: number; hidden: boolean;
};

export const toQuestion = (row: QuestionRow): QQuestion => ({
  id: row.id, sectionId: row.section_id, key: row.key, prompt: row.prompt, kind: row.kind, required: row.required, visibility: row.visibility,
  options: row.options ?? [], maxChoices: row.max_choices, matrixRows: row.matrix_rows ?? [], scale: row.scale ?? [], placeholder: row.placeholder,
  note: row.note, react: row.react, showIf: row.show_if, sort: row.sort, hidden: row.hidden,
});

/** Sections and questions of a form, hidden ones included (the admin needs them; the app filters). */
async function formContentUncached(formId: string): Promise<Pick<QContent, "sections" | "questions">> {
  const client = createPrivilegedClient();
  const [sections, questions] = await Promise.all([
    client.from("cq_sections").select("id,key,title,short,hello,intro,tease,anonymous,sort,hidden").eq("form_id", formId).order("sort"),
    client.from("cq_questions").select("id,section_id,key,prompt,kind,required,visibility,options,max_choices,matrix_rows,scale,placeholder,note,react,show_if,sort,hidden").eq("form_id", formId).order("sort"),
  ]);
  for (const result of [sections, questions]) if (result.error) { if (questionnaireMissing(result.error)) throw questionnaireWaiting(); databaseError(result.error); }
  return { sections: (sections.data ?? []) as SectionRow[] as QSection[], questions: ((questions.data ?? []) as QuestionRow[]).map(toQuestion) };
}
export const formContent = cache(formContentUncached);

/** What a department question offers: the departments of Data karyawan's units, else departments named on employees. */
async function departmentOptionsUncached(): Promise<string[]> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("org_units").select("name,sort_order").eq("kind", "departemen").order("sort_order").order("name");
  if (!error && data?.length) return data.map(unit => unit.name);
  const people = await listPeople();
  return [...new Set(people.filter(person => person.active && person.department).map(person => person.department))].sort((a, b) => a.localeCompare(b, "id"));
}
export const departmentOptions = cache(departmentOptionsUncached);

/** What a person question offers: active employees, A to Z, by id. */
async function peopleOptionsUncached(): Promise<{ id: string; name: string; department: string }[]> {
  const people = await listPeople();
  return people.filter(person => person.active).map(({ id, name, department }) => ({ id, name, department })).sort((a, b) => a.name.localeCompare(b.name, "id"));
}
export const peopleOptions = cache(peopleOptionsUncached);
