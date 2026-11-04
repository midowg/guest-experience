import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { QuestionnaireProgress } from "@/components/admin/wam/questionnaire/QuestionnaireProgress";
import { QuestionnaireTabs } from "@/components/admin/wam/questionnaire/QuestionnaireTabs";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { questionnaireProgress } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progres kuesioner · Admin WAM" };

/** Any admin: who has started and finished the questionnaire, by department. No answers are shown. */
export default async function QuestionnaireProgressPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const report = await questionnaireProgress();
  return <WamAdminFrame current="kuesioner">
    <QuestionnaireTabs current="progres" />
    {report ? <QuestionnaireProgress report={report} /> : <QuestionnaireWaiting />}
  </WamAdminFrame>;
}
