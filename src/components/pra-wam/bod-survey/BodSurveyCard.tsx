import { ChevronRight, ClipboardList, Download } from "lucide-react";
import { percentOf } from "@/lib/pra-wam/bod-survey";
import { Ring } from "./Ring";
import css from "./bod-survey.module.css";

/**
 * The questionnaire on BoD's Ringkasan (24 Nov 2026), under Jejak karbon: how many finished, and
 * the way to Data kuesioner (every summary, each person, Export).
 */
export function BodSurveyCard({ name, done, active, href, exportHref }: { name: string; done: number; active: number; href: string; exportHref: string }) {
  return <section className={css.card} aria-labelledby="bod-survey-card">
    <a className={css.cardMain} href={href}>
      <span className={css.cardIcon}><ClipboardList aria-hidden /></span>
      <span className={css.cardText}>
        <small>Data kuesioner</small>
        <strong id="bod-survey-card">{name}</strong>
        <span>{done} dari {active} karyawan selesai · {Math.max(0, active - done)} belum</span>
      </span>
      <Ring value={percentOf(done, active)} size={64} />
    </a>
    <div className={css.cardActions}>
      <a className={css.cardOpen} href={href}>Lihat semua jawaban <ChevronRight aria-hidden /></a>
      <a className={css.cardExport} href={exportHref}><Download aria-hidden /> Export</a>
    </div>
  </section>;
}
