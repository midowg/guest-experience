import "server-only";
import type { AnswerValue, QForm } from "@/lib/pra-wam/questionnaire";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { PERSON_COLUMNS, cardsMissing, catalogOf, viewOf, type CardView, type PersonCardRow } from "./cards";
import { answerLines } from "./hr-lock";
import { formContent, questionnaireMissing } from "./questionnaire";

/*
 * Rekan (stage 3): the cards of everyone who finished the questionnaire, and each person's profile
 * for colleagues, made only of answers marked `rekan` ("Rekan bisa lihat ini"). Trial cards from
 * the draft never show. Nothing marked for panitia, HR or anonymous ever leaves here.
 */

export type GalleryEntry = { employeeId: string; name: string; department: string; card: CardView };
export type Gallery = { entries: GalleryEntry[]; ready: boolean };

/** Every numbered card of the form, in number order, with whose it is. */
export async function galleryOf(form: Pick<QForm, "id">): Promise<Gallery> {
  const catalog = await catalogOf(form.id);
  if (!catalog) return { entries: [], ready: false };
  const rows: PersonCardRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await createPrivilegedClient().from("cq_person_cards").select(PERSON_COLUMNS)
      .eq("form_id", form.id).eq("trial", false).order("serial").range(from, from + page - 1);
    if (error) { if (cardsMissing(error)) return { entries: [], ready: false }; databaseError(error); }
    rows.push(...((data ?? []) as PersonCardRow[]));
    if ((data?.length ?? 0) < page) break;
  }
  const people = new Map((await listPeople()).map(person => [person.id, person]));
  const entries = rows.flatMap(row => {
    const person = people.get(row.employee_id);
    const card = viewOf(row, catalog);
    // Someone no longer in Data karyawan (or no longer active) is not shown to colleagues.
    return person?.active && card ? [{ employeeId: row.employee_id, name: person.name, department: person.department, card }] : [];
  });
  return { entries, ready: true };
}

/** Whether this person has a numbered card: they finished, and may see their colleagues' cards. */
export async function hasNumberedCard(form: Pick<QForm, "id">, employeeId: string): Promise<boolean> {
  const { data, error } = await createPrivilegedClient().from("cq_person_cards").select("serial")
    .eq("form_id", form.id).eq("employee_id", employeeId).eq("trial", false).maybeSingle();
  if (error) { if (cardsMissing(error)) return false; databaseError(error); }
  return !!data;
}

export type ColleagueAnswer = { key: string; prompt: string; lines: string[] };
export type ColleagueProfile = { person: { id: string; name: string; department: string }; card: CardView; answers: ColleagueAnswer[] };

/** One colleague's card and their answers marked `rekan`, in the questionnaire's order; null without a numbered card. */
export async function colleagueOf(form: Pick<QForm, "id">, employeeId: string): Promise<ColleagueProfile | null> {
  const [people, catalog, row] = await Promise.all([
    listPeople(), catalogOf(form.id),
    createPrivilegedClient().from("cq_person_cards").select(PERSON_COLUMNS).eq("form_id", form.id).eq("employee_id", employeeId).eq("trial", false).maybeSingle(),
  ]);
  if (row.error) { if (cardsMissing(row.error)) return null; databaseError(row.error); }
  const person = people.find(item => item.id === employeeId);
  const card = row.data && catalog ? viewOf(row.data as PersonCardRow, catalog) : null;
  if (!person?.active || !card) return null;

  const { sections, questions } = await formContent(form.id);
  const shown = new Map(sections.filter(section => !section.hidden && !section.anonymous).map(section => [section.id, section]));
  const asked = questions.filter(question => question.visibility === "rekan" && !question.hidden && question.kind !== "consent" && shown.has(question.sectionId))
    .sort((a, b) => (shown.get(a.sectionId)!.sort - shown.get(b.sectionId)!.sort) || a.sort - b.sort);
  const { data, error } = asked.length
    ? await createPrivilegedClient().from("cq_answers").select("question_id,value").eq("form_id", form.id).eq("employee_id", employeeId).in("question_id", asked.map(question => question.id))
    : { data: [], error: null };
  if (error) { if (questionnaireMissing(error)) return { person: { id: person.id, name: person.name, department: person.department }, card, answers: [] }; databaseError(error); }
  const values = new Map((data ?? []).map(item => [item.question_id as string, item.value as AnswerValue]));
  const names = new Map(people.map(item => [item.id, item.name]));
  const answers = asked.flatMap(question => {
    const value = values.get(question.id);
    const lines = value === undefined ? [] : answerLines(question.kind, value, names).map(line => line.trim()).filter(Boolean);
    return lines.length ? [{ key: question.key, prompt: question.prompt, lines }] : [];
  });
  return { person: { id: person.id, name: person.name, department: person.department }, card, answers };
}
