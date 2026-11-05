import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { QuestionnaireExport } from "@/components/admin/wam/questionnaire/QuestionnaireExport";
import { QuestionnaireTabs } from "@/components/admin/wam/questionnaire/QuestionnaireTabs";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { adminReader } from "@/lib/pra-wam/recap";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { hrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { exportPlan } from "@/lib/server/pra-wam/recap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ekspor kuesioner · Admin WAM", robots: { index: false, follow: false } };

/** Any admin: what each section's Excel sheet will hold, and the downloads. The file itself comes from the export API. */
export default async function QuestionnaireExportPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const form = await currentForm();
  const unlock = form ? await hrUnlocked() : null;
  const open = !!form && unlock?.formId === form.id;
  const plan = form ? await exportPlan(form, adminReader(open)) : null;
  return <WamAdminFrame current="kuesioner">
    <QuestionnaireTabs current="ekspor" />
    {form && plan ? <QuestionnaireExport plan={plan} hrOpenBy={open ? unlock!.actor.name : null} /> : <QuestionnaireWaiting />}
  </WamAdminFrame>;
}
