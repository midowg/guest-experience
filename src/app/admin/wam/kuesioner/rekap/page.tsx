import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { QuestionnaireRecap } from "@/components/admin/wam/questionnaire/QuestionnaireRecap";
import { QuestionnaireTabs } from "@/components/admin/wam/questionnaire/QuestionnaireTabs";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { adminReader } from "@/lib/pra-wam/recap";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { hrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { recapOf } from "@/lib/server/pra-wam/recap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rekap kuesioner · Admin WAM", robots: { index: false, follow: false } };

/**
 * Any admin: the questionnaire per question as charts and quotes, never with a name, for everyone
 * or one department. HR questions show as counts until Data HR is open in this browser; the
 * anonymous section only as a whole and from five answers on.
 */
export default async function QuestionnaireRecapPage({ searchParams }: { searchParams: Promise<{ departemen?: string | string[] }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const form = await currentForm();
  const asked = (await searchParams).departemen;
  const department = typeof asked === "string" && asked ? asked.slice(0, 120) : null;
  const unlock = form ? await hrUnlocked() : null;
  const recap = form ? await recapOf(form, adminReader(unlock?.formId === form.id), department) : null;
  return <WamAdminFrame current="kuesioner" wide>
    <QuestionnaireTabs current="rekap" />
    {recap ? <QuestionnaireRecap recap={recap} /> : <QuestionnaireWaiting />}
  </WamAdminFrame>;
}
