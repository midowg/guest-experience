import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { QuestionnaireProgress } from "@/components/admin/wam/questionnaire/QuestionnaireProgress";
import { QuestionnaireTabs } from "@/components/admin/wam/questionnaire/QuestionnaireTabs";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { editable } from "@/lib/pra-wam/questionnaire";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { questionnaireProgress } from "@/lib/server/pra-wam/questionnaire-admin";
import { lastReminder } from "@/lib/server/pra-wam/reminders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progres kuesioner · Admin WAM" };

/** Any admin: who has started and finished the questionnaire, by department, and "Ingatkan yang belum". No answers are shown. */
export default async function QuestionnaireProgressPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [report, form, last] = await Promise.all([questionnaireProgress(), currentForm().catch(() => null), lastReminder()]);
  const reminder = { open: !!form && form.status === "buka" && editable(form), last };
  return <WamAdminFrame current="kuesioner">
    <QuestionnaireTabs current="progres" />
    {report ? <QuestionnaireProgress report={report} reminder={reminder} /> : <QuestionnaireWaiting />}
  </WamAdminFrame>;
}
