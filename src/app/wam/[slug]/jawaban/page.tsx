import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ReadOnlyAnswers } from "@/components/pra-wam/questionnaire/ReadOnly";
import { sectionsDone } from "@/components/pra-wam/questionnaire/steps";
import { seesQuestionnaire } from "@/lib/pra-wam/questionnaire";
import { managesApp } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { formAt, formContent, peopleOptions } from "@/lib/server/pra-wam/questionnaire";
import { myCard } from "@/lib/server/pra-wam/cards";
import { myAnswers, shownContent } from "@/lib/server/pra-wam/questionnaire-answers";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Jawaban kuesionermu · WAM", robots: { index: false } };

/**
 * My questionnaire answers, read only, on their own page (17 Nov 2026), opened from my card's page.
 * Only once my card is out (my answers are locked then); before that the questionnaire itself.
 */
export default async function AnswersPage({ params }: Params) {
  const { slug } = await params;
  const found = await formAt(slug);
  if (!found) notFound();
  const { form } = found;
  const self = `${praWamPath.questionnaire(form.slug)}/jawaban`;
  if (found.moved) permanentRedirect(self);
  const member = await requireMemberPage(self);
  if (form.status === "draf" || !seesQuestionnaire(form, member.id, managesApp(member))) notFound();
  const card = await myCard(form, member.id).catch(() => null);
  if (!card || card.trial) redirect(praWamPath.questionnaire(form.slug));

  const content = shownContent(await formContent(form.id), form);
  const [mine, staff] = await Promise.all([
    myAnswers(form, member.id, content),
    content.questions.some(question => question.kind === "person") ? peopleOptions() : [],
  ]);
  return <ReadOnlyAnswers finished name={form.name} home={praWamPath.home} sections={content.sections} questions={content.questions}
    answers={mine.answers} anonymousSent={mine.anonymousSent} slots={sectionsDone(content, mine.answers, mine.anonymousSent)}
    people={staff.filter(person => person.id !== member.id)} back={{ href: praWamPath.questionnaire(form.slug), label: "Kembali ke kartu tokohmu" }} />;
}
