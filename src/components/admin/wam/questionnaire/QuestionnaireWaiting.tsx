import { Notice } from "@/components/ui";
import { QUESTIONNAIRE_MIGRATION } from "@/lib/server/pra-wam/questionnaire";

/** Before the questionnaire's migration: nothing to edit or count yet. */
export function QuestionnaireWaiting() {
  return <Notice tone="warning">Kuesioner menunggu migrasi {QUESTIONNAIRE_MIGRATION}. Setelah migrasi dijalankan, kuesioner bawaan &quot;Kuesioner&quot; (draf, 6 bagian) muncul di sini.</Notice>;
}
