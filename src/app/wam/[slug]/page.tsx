import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Questionnaire } from "@/components/pra-wam/questionnaire/Questionnaire";
import { ReadOnlyAnswers } from "@/components/pra-wam/questionnaire/ReadOnly";
import { sectionsDone } from "@/components/pra-wam/questionnaire/steps";
import { editable } from "@/lib/pra-wam/questionnaire";
import { managesApp } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { departmentOptions, formAt, formContent, peopleOptions } from "@/lib/server/pra-wam/questionnaire";
import { myCard } from "@/lib/server/pra-wam/cards";
import { myAnswers, shownContent } from "@/lib/server/pra-wam/questionnaire-answers";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const found = await formAt((await params).slug).catch(() => null);
  return { title: found && found.form.status !== "draf" ? `${found.form.name} · WAM` : "WAM", robots: { index: false } };
}

/**
 * The personal questionnaire at the address HR gives it (bawaannya /wam/kuesioner). WAM's own
 * pages are static routes and win over this one; any other address is not found unless it is the
 * form's, and an old address moves permanently to the current one. A draft is not found for
 * participants, but Admin WAM can try it (marked "Pratinjau draf"; its answers are test data);
 * once closed, or past the deadline, the person sees their answers read only.
 */
export default async function QuestionnairePage({ params }: Params) {
  const { slug } = await params;
  const found = await formAt(slug);
  if (!found) notFound();
  const { form } = found;
  if (found.moved) permanentRedirect(praWamPath.questionnaire(form.slug));
  const member = await requireMemberPage(praWamPath.questionnaire(form.slug));
  const preview = form.status === "draf";
  if (preview && !managesApp(member)) notFound();

  const content = shownContent(await formContent(form.id));
  const [mine, card, departments, staff] = await Promise.all([
    myAnswers(form, member.id, content),
    // A trial card from the draft is shown only while trying the draft.
    myCard(form, member.id).then(view => view?.trial && !preview ? null : view).catch(() => null),
    content.questions.some(question => question.kind === "department") ? departmentOptions() : [],
    content.questions.some(question => question.kind === "person") ? peopleOptions() : [],
  ]);
  // "Pilih rekan" never offers the person themself.
  const people = staff.filter(person => person.id !== member.id);
  const nickname = member.nickname || member.name.split(" ")[0];

  if (!preview && !editable(form)) {
    return <ReadOnlyAnswers name={form.name} home={praWamPath.home} sections={content.sections} questions={content.questions}
      answers={mine.answers} anonymousSent={mine.anonymousSent} slots={sectionsDone(content, mine.answers, mine.anonymousSent)} people={people}
      card={card && { formId: form.id, view: card, nickname, hasPhoto: !!member.photo }} />;
  }
  return <Questionnaire
    form={{ id: form.id, name: form.name, intro: form.intro, minutes: form.minutes, editUntil: form.editUntil }}
    sections={content.sections} questions={content.questions} departments={departments} people={people}
    initial={{ answers: mine.answers, anonymousSent: mine.anonymousSent }}
    nickname={nickname} home={praWamPath.home} preview={preview} card={card} hasPhoto={!!member.photo} />;
}
