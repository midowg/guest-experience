import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { QuestionnaireContent } from "@/components/admin/wam/questionnaire/QuestionnaireContent";
import { QuestionnaireFrame, questionnaireContent } from "@/components/admin/wam/questionnaire/QuestionnaireFrame";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Isi kuesioner · Admin WAM" };

/** Any admin: the questionnaire's sections and questions, with a preview. */
export default async function QuestionnaireContentPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const content = await questionnaireContent();
  return <QuestionnaireFrame current="konten" wide>
    {content ? <QuestionnaireContent initial={content} /> : <QuestionnaireWaiting />}
  </QuestionnaireFrame>;
}
