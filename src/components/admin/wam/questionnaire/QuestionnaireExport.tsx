import { Download, Lock } from "lucide-react";
import { Notice } from "@/components/ui";
import { SectionToolbar } from "@/components/console";
import { MIN_GROUP } from "@/lib/pra-wam/recap";
import { praWamQuestionnaireApi, wamAdminPath } from "@/lib/routes";
import type { ExportPlan } from "@/lib/server/pra-wam/recap";
import styles from "./questionnaire.module.css";

/**
 * Admin WAM → Kuesioner → Ekspor: one Excel file with a sheet per section, or one section alone.
 * The page says what goes in (the header holds "Unduh semua bagian"); the export API decides again on the server and logs an export
 * that holds HR answers.
 */
export function QuestionnaireExport({ plan, hrOpenBy }: { plan: ExportPlan[]; hrOpenBy: string | null }) {
  const describe = (section: ExportPlan) => {
    if (section.anonymous) return `${section.total} pertanyaan, satu baris per jawaban tanpa nama. Baru diekspor setelah ada ${MIN_GROUP} kiriman.`;
    if (!section.columns) return "Semua pertanyaannya data HR. Buka Data HR untuk mengekspor bagian ini.";
    return `${section.columns} dari ${section.total} pertanyaan${section.needsHr ? `; ${section.needsHr} pertanyaan HR tidak ikut` : ""}. Satu baris per orang.`;
  };
  return <div className="stack">
    <SectionToolbar title="Isi file" count={`${plan.length} bagian`} />
    <p className={styles.muted}>File Excel, satu lembar per bagian. Berisi data pribadi: simpan di tempat yang aman.</p>
    {hrOpenBy
      ? <Notice tone="warning">Data HR dibuka oleh {hrOpenBy}. Jawaban HR ikut di file, dan setiap unduhan yang berisi data HR tercatat di log akses Data HR atas nama {hrOpenBy}.</Notice>
      : <Notice tone="info"><Lock size={14} aria-hidden /> Jawaban HR tidak ikut selama Data HR terkunci. <a href={wamAdminPath.questionnaire.hrData}>Buka Data HR</a> untuk menyertakannya.</Notice>}
    <ul className={styles.exportList}>
      {plan.map(section => <li key={section.key} className={styles.exportRow}>
        <div>
          <strong>{section.title}{section.anonymous ? " (anonim)" : ""}</strong>
          <p className={styles.recapNote}>{describe(section)}</p>
        </div>
        {section.anonymous || section.columns
          ? <a className={styles.download} href={praWamQuestionnaireApi.export(section.key)} download aria-label={`Unduh bagian ${section.title}`}><Download size={18} aria-hidden /> Unduh</a>
          : null}
      </li>)}
    </ul>
  </div>;
}
