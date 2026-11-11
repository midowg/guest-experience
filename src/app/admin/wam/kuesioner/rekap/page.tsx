import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { AnswerTable } from "@/components/admin/wam/questionnaire/AnswerTable";
import { QuestionnaireFrame } from "@/components/admin/wam/questionnaire/QuestionnaireFrame";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { editable } from "@/lib/pra-wam/questionnaire";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { answerTable } from "@/lib/server/pra-wam/answer-table";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { lastReminder } from "@/lib/server/pra-wam/reminders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rekap kuesioner · Admin WAM", robots: { index: false, follow: false } };

/**
 * Any admin (11 Nov 2026, owner's decision: one page, everything open): the progress counts,
 * "Ingatkan", and one table with a row per person and every named answer, HR and Rahasia included,
 * with its Excel download. Progres, Data HR and Ekspor now lead here.
 */
export default async function QuestionnaireRecapPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const form = await currentForm();
  const [table, last] = form ? await Promise.all([answerTable(form), lastReminder()]) : [null, null];
  const reminder = { open: !!form && form.status === "buka" && editable(form), last };
  return <QuestionnaireFrame current="rekap" wide>
    {table ? <AnswerTable table={table} reminder={reminder} /> : <QuestionnaireWaiting />}
  </QuestionnaireFrame>;
}
