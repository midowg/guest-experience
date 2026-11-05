import { Lock } from "lucide-react";
import { Notice } from "@/components/ui";
import { MIN_GROUP, type RecapItem } from "@/lib/pra-wam/recap";
import { wamAdminPath } from "@/lib/routes";
import type { Recap } from "@/lib/server/pra-wam/recap";
import { visibilityShort } from "./labels";
import styles from "./questionnaire.module.css";

const pillClass: Record<RecapItem["visibility"], string> = {
  rekan: styles.pillRekan, fasil: styles.pillFasil, hr: styles.pillHr, hronly: styles.pillHronly, pilih: styles.pillPilih, anon: styles.pillAnon,
};
const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
/** Quotes shown before "Tampilkan semua". */
const FIRST_QUOTES = 8;

function Bars({ item }: { item: RecapItem & { body: { type: "bars" } } }) {
  const top = Math.max(1, ...item.body.bars.map(bar => bar.count));
  return <ul className={styles.bars}>
    {item.body.bars.map(bar => {
      const share = percent(bar.count, item.answered);
      return <li key={bar.label} className={styles.barRow} title={`${bar.label}: ${bar.count} orang (${share}%)`}>
        <span className={styles.barLabel}>{bar.label}</span>
        <span className={styles.barTrack} aria-hidden><span className={styles.barFill} data-zero={bar.count ? undefined : ""} style={{ width: `${(bar.count / top) * 100}%` }} /></span>
        <span className={styles.barValue}>{bar.count} <span>· {share}%</span></span>
      </li>;
    })}
    {item.body.rest > 0 && <li className={styles.recapNote}>dan {item.body.rest} nama lain yang dipilih lebih sedikit.</li>}
  </ul>;
}

function Matrix({ item }: { item: RecapItem & { body: { type: "matrix" } } }) {
  const { scale, rows } = item.body;
  return <div className={styles.matrixWrap}>
    <table className={styles.matrix}>
      <caption className="sr-only">{item.prompt}: jumlah orang per pilihan, per baris</caption>
      <thead><tr><th scope="col"><span className="sr-only">Baris</span></th>{scale.map(choice => <th key={choice} scope="col">{choice}</th>)}</tr></thead>
      <tbody>{rows.map(row => {
        const total = row.counts.reduce((sum, count) => sum + count, 0);
        return <tr key={row.label}>
          <th scope="row">{row.label}</th>
          {row.counts.map((count, index) => {
            const share = total ? count / total : 0;
            // One hue, light to darker by share, kept light enough for dark text; the number is always written, so colour is never the only cue.
            return <td key={scale[index]} title={`${row.label}, ${scale[index]}: ${count} (${percent(count, total)}%)`}
              style={{ background: `rgba(29, 79, 184, ${(0.05 + share * 0.5).toFixed(2)})` }}>
              {count}<small>{percent(count, total)}%</small>
            </td>;
          })}
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

function Quotes({ item }: { item: RecapItem & { body: { type: "quotes" } } }) {
  const quote = (entry: { text: string; count: number }) => <li key={entry.text} className={styles.quote}>
    {entry.text}{entry.count > 1 && <b>×{entry.count}</b>}
  </li>;
  const { quotes } = item.body;
  return <>
    <ul className={styles.quotes}>{quotes.slice(0, FIRST_QUOTES).map(quote)}</ul>
    {quotes.length > FIRST_QUOTES && <details className={styles.more}>
      <summary>Tampilkan semua ({quotes.length})</summary>
      <ul className={styles.quotes}>{quotes.slice(FIRST_QUOTES).map(quote)}</ul>
    </details>}
  </>;
}

function Body({ item, anonymous }: { item: RecapItem; anonymous: boolean }) {
  switch (item.body.type) {
    case "bars": return <Bars item={item as RecapItem & { body: { type: "bars" } }} />;
    case "matrix": return <Matrix item={item as RecapItem & { body: { type: "matrix" } }} />;
    case "quotes": return <Quotes item={item as RecapItem & { body: { type: "quotes" } }} />;
    case "needs-hr": return <p className={styles.recapNote}><Lock size={14} aria-hidden /> Data HR. <a href={wamAdminPath.questionnaire.hrData}>Buka Data HR</a> untuk melihat rekapnya.</p>;
    case "few": return <p className={styles.recapNote}>Baru {item.answered} jawaban. Rekap {anonymous ? "anonim" : "ini"} tampil mulai {MIN_GROUP} jawaban, supaya tidak ada yang bisa ditebak.</p>;
    case "none": return <p className={styles.recapNote}>Belum ada jawaban.</p>;
  }
}

/**
 * Admin WAM → Kuesioner → Rekap: each question as bars, a matrix table or quotes, without a single
 * name. Server-rendered from recapOf, which already left out what this reader may not see.
 */
export function QuestionnaireRecap({ recap }: { recap: Recap }) {
  return <div className="stack">
    <div className={styles.recapHead}>
      <div className={styles.head}>
        <div>
          <h2>Rekap</h2>
          <p className={styles.muted}>{recap.respondents} orang sudah menjawab{recap.department ? ` di ${recap.department}` : ""}. Tanpa nama; kutipan diurutkan acak.</p>
        </div>
      </div>
      <form method="get" className={styles.recapFilter}>
        <label>Departemen
          <select name="departemen" className="select" defaultValue={recap.department ?? ""}>
            <option value="">Semua departemen</option>
            {recap.departments.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <button type="submit" className={styles.download}>Terapkan</button>
      </form>
      {recap.hrOpen
        ? <Notice tone="info">Data HR terbuka di perangkat ini, jadi rekap pertanyaan HR ikut tampil lengkap.</Notice>
        : <Notice tone="info">Pertanyaan HR tampil sebagai jumlah pilihan saja; isian dan pertanyaan Rahasia HR baru tampil setelah <a href={wamAdminPath.questionnaire.hrData}>Data HR dibuka</a>.</Notice>}
    </div>

    {recap.sections.map(section => <section key={section.key} className={styles.recapSection} aria-labelledby={`rekap-${section.key}`}>
      <h3 id={`rekap-${section.key}`}>{section.title}{section.anonymous ? " (anonim)" : ""}</h3>
      {section.notSplit
        ? <p className={styles.recapNote}>Bagian anonim tidak dipilah per departemen, karena jawabannya tidak disimpan dengan nama. Pilih &quot;Semua departemen&quot; untuk melihat rangkumannya.</p>
        : section.items.length === 0
          ? <p className={styles.recapNote}>Belum ada pertanyaan di bagian ini.</p>
          : <ol className={styles.recapItems}>
            {section.items.map(item => <li key={item.key} className={styles.recapItem}>
              <h4><span className={styles.questionNumber}>{item.key}</span><span>{item.prompt}</span></h4>
              <div className={styles.recapMeta}>
                <span className={`${styles.pill} ${pillClass[item.visibility]}`}>{visibilityShort[item.visibility]}</span>
                {item.body.type !== "needs-hr" && <span>{item.answered} {section.anonymous ? "jawaban" : "orang menjawab"}{item.several && item.body.type === "bars" ? " · boleh lebih dari satu pilihan" : ""}</span>}
              </div>
              <Body item={item} anonymous={section.anonymous} />
            </li>)}
          </ol>}
    </section>)}
  </div>;
}
