import { notFound } from "next/navigation";
import { ListChecks } from "lucide-react";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/bod.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hasil survei · WAM", robots: { index: false } };

/**
 * Hasil survei (Penpot "B4"). WAM has no surveys yet, so this is the honest empty state the
 * Ringkasan and the BOD menu lead to; the results (participation, answers per question, most
 * common suggestion, filters per survey and department) come with the survey feature.
 */
export default async function SurveyResultsPage() {
  const member = await requireMemberPage(praWamPath.surveyResults);
  if (!seesAllSessions(member)) notFound();
  return <PraWamShell member={member} current="survei">
    <ScreenHead title="Hasil survei" lead="Akses baca saja" />
    <section className={`${base.card} ${styles.emptyState}`} aria-labelledby="belum-ada">
      <span className={base.tile}><ListChecks aria-hidden /></span>
      <h2 id="belum-ada">Belum ada survei</h2>
      <p>Hasil survei muncul di sini setelah panitia menerbitkan survei pertama: partisipasi, jawaban per pertanyaan, dan saran terbanyak.</p>
    </section>
  </PraWamShell>;
}
