import { cache, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { ConsoleButtonLink, PageHeader } from "@/components/console";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs } from "@/components/admin/wam/sections";
import type { QForm } from "@/lib/pra-wam/questionnaire";
import { praWamPath } from "@/lib/routes";
import { adminQuestionnaire } from "@/lib/server/pra-wam/questionnaire-admin";
import { statusLabels } from "./labels";
import { QuestionnaireTabs, questionnaireTabLabel, type QuestionnaireTab } from "./QuestionnaireTabs";

/** The questionnaire with its sections and questions, read once per request (the header and the Isi or Pengaturan tab share it); null before the migration. */
export const questionnaireContent = cache(adminQuestionnaire);

const deadline = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/** "Dibuka · bisa diubah sampai 20 Nov 2026 17.00 WIB · 42 pertanyaan": the line under the page title. */
export function questionnaireSubtitle(form: Pick<QForm, "status" | "editUntil">, questions: number): string {
  const until = form.editUntil ? `bisa diubah sampai ${deadline(form.editUntil)} WIB` : "tanpa tenggat";
  return `${statusLabels[form.status]} · ${until} · ${questions} pertanyaan`;
}

/**
 * Every Kuesioner tab in the console frame: one header "Kuesioner personal" (its status, deadline
 * and question count; Pratinjau opens the participant page; `primary` is the tab's main action),
 * the tabs, and the tab itself. No answers are read here, so it is safe on the HR pages.
 */
export async function QuestionnaireFrame({ current, primary, wide = false, children }: { current: QuestionnaireTab; primary?: ReactNode; wide?: boolean; children: ReactNode }) {
  // The header only describes; on a read error the tab itself reports it.
  const content = await questionnaireContent().catch(() => null);
  const questions = content ? content.questions.filter(question => !question.hidden).length : 0;
  return <WamAdminFrame current="kuesioner" wide={wide}>
    <PageHeader crumbs={wamCrumbs("kuesioner", questionnaireTabLabel(current))} title="Kuesioner personal"
      subtitle={content ? questionnaireSubtitle(content.form, questions) : undefined}
      actions={content || primary ? <>
        {content && <ConsoleButtonLink href={praWamPath.questionnaire(content.form.slug)} target="_blank" rel="noopener" icon={<Eye size={18} aria-hidden="true" />}>
          Pratinjau<span className="sr-only"> (tab baru)</span>
        </ConsoleButtonLink>}
        {primary}
      </> : undefined} />
    <QuestionnaireTabs current={current} />
    {children}
  </WamAdminFrame>;
}
