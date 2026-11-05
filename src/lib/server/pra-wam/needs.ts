import "server-only";
import { NEED_BLOCKS, needBlock, type NeedBlock, type NeedPerson } from "@/lib/pra-wam/needs";
import type { AnswerValue, QForm } from "@/lib/pra-wam/questionnaire";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { formContent, questionnaireMissing, questionnaireWaiting } from "./questionnaire";

/*
 * Kebutuhan peserta for the panitia (src/lib/pra-wam/needs.ts has the rules). The route decides who
 * may open it (panitia and admin); this never reads `hronly` questions at all.
 */

export type Needs = { blocks: NeedBlock[]; answered: number; active: number };

export async function needsOf(form: Pick<QForm, "id">): Promise<Needs> {
  const [{ sections, questions }, everyone] = await Promise.all([formContent(form.id), listPeople()]);
  const shownSections = new Set(sections.filter(section => !section.hidden && !section.anonymous).map(section => section.id));
  const wanted = NEED_BLOCKS.map(block => ({ block, question: questions.find(question => question.key === block.key && !question.hidden && shownSections.has(question.sectionId)) }))
    .filter((item): item is { block: (typeof NEED_BLOCKS)[number]; question: NonNullable<typeof item.question> } => !!item.question && item.question.visibility !== "hronly");
  const active = everyone.filter(person => person.active);
  const people = new Map<string, NeedPerson>(active.map(({ id, name, department }) => [id, { id, name, department }]));
  const rows: { employee_id: string; question_id: string; value: AnswerValue; read_level?: string | null }[] = [];
  if (wanted.length) {
    const client = createPrivilegedClient();
    for (let from = 0; ; from += 1000) {
      // "*" brings read_level once migration 202611050002 is in, and breaks nothing before it.
      const { data, error } = await client.from("cq_answers").select("*").eq("form_id", form.id).in("question_id", wanted.map(item => item.question.id))
        .order("employee_id").order("question_id").range(from, from + 999);
      if (error) { if (questionnaireMissing(error)) throw questionnaireWaiting(); databaseError(error); }
      rows.push(...((data ?? []) as typeof rows));
      if ((data?.length ?? 0) < 1000) break;
    }
  }
  const blocks = wanted.map(({ block, question }) => needBlock(block, question,
    rows.filter(row => row.question_id === question.id).map(row => ({ employeeId: row.employee_id, value: row.value, readLevel: row.read_level })), people))
    .filter((block): block is NeedBlock => !!block);
  return { blocks, answered: new Set(rows.filter(row => people.has(row.employee_id)).map(row => row.employee_id)).size, active: active.length };
}
