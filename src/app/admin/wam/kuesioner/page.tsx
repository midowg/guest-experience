import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { QuestionnaireContent } from "@/components/admin/wam/questionnaire/QuestionnaireContent";
import { QuestionnaireTabs } from "@/components/admin/wam/questionnaire/QuestionnaireTabs";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminQuestionnaire } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Konten kuesioner · Admin WAM" };

/** Any admin: the questionnaire's sections and questions, with a preview. */
export default async function QuestionnaireContentPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const content = await adminQuestionnaire();
  return <WamAdminFrame current="kuesioner" wide>
    <QuestionnaireTabs current="konten" />
    {content ? <QuestionnaireContent initial={content} /> : <QuestionnaireWaiting />}
  </WamAdminFrame>;
}
