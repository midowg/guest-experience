import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { HrPasswordSettings } from "@/components/admin/wam/questionnaire/HrPasswordSettings";
import { QuestionnaireSettings } from "@/components/admin/wam/questionnaire/QuestionnaireSettings";
import { QuestionnaireTabs } from "@/components/admin/wam/questionnaire/QuestionnaireTabs";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminQuestionnaire } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan kuesioner · Admin WAM" };

/** Any admin: the questionnaire's name, address, status, texts, dates, and the HR password. */
export default async function QuestionnaireSettingsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const content = await adminQuestionnaire();
  return <WamAdminFrame current="kuesioner">
    <QuestionnaireTabs current="pengaturan" />
    {content
      ? <div className="stack">
        <QuestionnaireSettings initial={content.form} />
        <HrPasswordSettings hasPassword={content.form.hasHrPassword} />
      </div>
      : <QuestionnaireWaiting />}
  </WamAdminFrame>;
}
