import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { HrAccessSettings } from "@/components/admin/wam/questionnaire/HrAccessSettings";
import { QuestionnaireSettings } from "@/components/admin/wam/questionnaire/QuestionnaireSettings";
import { QuestionnaireTabs } from "@/components/admin/wam/questionnaire/QuestionnaireTabs";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { hrAccessSettings } from "@/lib/server/pra-wam/hr-lock";
import { adminQuestionnaire } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan kuesioner · Admin WAM" };

/** Any admin: the questionnaire's name, address, status, texts, dates, and who has Data HR access (the super admin changes it). */
export default async function QuestionnaireSettingsPage() {
  const role = await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const content = await adminQuestionnaire();
  // Only the super admin gets the picker's list of people.
  const access = content ? await hrAccessSettings({ withCandidates: role === "super" }) : null;
  return <WamAdminFrame current="kuesioner">
    <QuestionnaireTabs current="pengaturan" />
    {content
      ? <div className="stack">
        <QuestionnaireSettings initial={content.form} />
        {access && <HrAccessSettings initial={access} canEdit={role === "super"} />}
      </div>
      : <QuestionnaireWaiting />}
  </WamAdminFrame>;
}
