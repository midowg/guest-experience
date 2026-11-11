import { redirect } from "next/navigation";
import { wamAdminPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** Since 11 Nov 2026 everything is on one page: Rekap (a row per person, every answer, the Excel download). */
export default function OldQuestionnairePage() {
  redirect(wamAdminPath.questionnaire.recap);
}
