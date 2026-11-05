import { Download } from "lucide-react";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { QuestionnaireExport } from "@/components/admin/wam/questionnaire/QuestionnaireExport";
import { QuestionnaireFrame } from "@/components/admin/wam/questionnaire/QuestionnaireFrame";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { ConsoleButtonLink } from "@/components/console";
import { adminReader } from "@/lib/pra-wam/recap";
import { praWamQuestionnaireApi } from "@/lib/routes";
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
  return <QuestionnaireFrame current="ekspor" primary={form && plan
    ? <ConsoleButtonLink variant="primary" href={praWamQuestionnaireApi.export()} download icon={<Download size={18} aria-hidden="true" />}>Unduh semua bagian</ConsoleButtonLink>
    : undefined}>
    {form && plan ? <QuestionnaireExport plan={plan} hrOpenBy={open ? unlock!.actor.name : null} /> : <QuestionnaireWaiting />}
  </QuestionnaireFrame>;
}
