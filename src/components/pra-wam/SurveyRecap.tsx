import { MIN_GROUP, type RecapItem } from "@/lib/pra-wam/recap";
import type { Participation, RecapSection } from "@/lib/server/pra-wam/recap";
import base from "./pra-wam.module.css";
import styles from "./survey-recap.module.css";

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
/** Quotes shown before "Lihat semua". */
const FIRST_QUOTES = 3;

/** Partisipasi (Penpot B4): who finished, of all active employees, as a meter. */
export function ParticipationMeter({ participation }: { participation: Participation }) {
  const share = percent(participation.done, participation.active);
  return <div className={styles.participation}>
    <div className={styles.participationHead}><span>Partisipasi</span><strong>{participation.done} dari {participation.active} · {share}%</strong></div>
    <div className={styles.track} role="img" aria-label={`${participation.done} dari ${participation.active} karyawan aktif selesai mengisi, ${share} persen`}>
      <span className={styles.fill} style={{ width: `${share}%` }} />
    </div>
  </div>;
}

function Bars({ item }: { item: RecapItem & { body: { type: "bars" } } }) {
  const top = Math.max(1, ...item.body.bars.map(bar => bar.count));
  return <ul className={styles.bars}>
    {item.body.bars.map(bar => <li key={bar.label} className={styles.bar} title={`${bar.label}: ${bar.count} (${percent(bar.count, item.answered)}%)`}>
      <span className={styles.barLabel}>{bar.label}</span>
      <span className={styles.barTrack} aria-hidden><span className={styles.barFill} style={{ width: `${(bar.count / top) * 100}%` }} data-zero={bar.count ? undefined : ""} /></span>
      <span className={styles.barValue}>{bar.count}</span>
    </li>)}
    {item.body.rest > 0 && <li className={base.meta}>dan {item.body.rest} nama lain.</li>}
  </ul>;
}

function Matrix({ item }: { item: RecapItem & { body: { type: "matrix" } } }) {
  const { scale, rows } = item.body;
  return <div className={styles.matrixWrap}>
    <table className={styles.matrix}>
      <caption className="sr-only">{item.prompt}: jumlah per pilihan, per baris</caption>
      <thead><tr><th scope="col"><span className="sr-only">Baris</span></th>{scale.map(choice => <th key={choice} scope="col">{choice}</th>)}</tr></thead>
      <tbody>{rows.map(row => {
        const total = row.counts.reduce((sum, count) => sum + count, 0);
        return <tr key={row.label}><th scope="row">{row.label}</th>{row.counts.map((count, index) =>
          <td key={scale[index]} style={{ ["--share" as string]: String(total ? count / total : 0) }}>{count}<small>{percent(count, total)}%</small></td>)}</tr>;
      })}</tbody>
    </table>
  </div>;
}

function Quotes({ item }: { item: RecapItem & { body: { type: "quotes" } } }) {
  const quote = (entry: { text: string; count: number }) => <li key={entry.text} className={styles.quote}>
    “{entry.text}”{entry.count > 1 && <span> · {entry.count} orang</span>}
  </li>;
  const { quotes } = item.body;
  return <>
    <ul className={styles.quotes}>{quotes.slice(0, FIRST_QUOTES).map(quote)}</ul>
    {quotes.length > FIRST_QUOTES && <details className={styles.more}>
      <summary>Lihat semua ({quotes.length})</summary>
      <ul className={styles.quotes}>{quotes.slice(FIRST_QUOTES).map(quote)}</ul>
    </details>}
  </>;
}

function Body({ item, anonymous }: { item: RecapItem; anonymous: boolean }) {
  switch (item.body.type) {
    case "bars": return <Bars item={item as RecapItem & { body: { type: "bars" } }} />;
    case "matrix": return <Matrix item={item as RecapItem & { body: { type: "matrix" } }} />;
    case "quotes": return <Quotes item={item as RecapItem & { body: { type: "quotes" } }} />;
    case "few": return <p className={styles.note}>Baru {item.answered} jawaban{anonymous ? "" : " di kelompok ini"}. Tampil mulai {MIN_GROUP} jawaban supaya tidak ada yang bisa ditebak.</p>;
    case "none": return <p className={styles.note}>Belum ada jawaban.</p>;
    case "needs-hr": return null;
  }
}

/**
 * Hasil survei (Penpot B4): the questionnaire per question for BOD and panitia, never with a name.
 * Questions only HR reads are left out altogether, as are written HR answers; the server already
 * left out what this reader may not see.
 */
export function SurveyRecap({ sections }: { sections: RecapSection[] }) {
  return <div className={styles.sections}>
    {sections.map(section => {
      const items = section.items.filter(item => item.body.type !== "needs-hr");
      if (!section.notSplit && !items.length) return null;
      return <section key={section.key} className={styles.section} aria-labelledby={`hasil-${section.key}`}>
        <h2 id={`hasil-${section.key}`} className={styles.sectionTitle}>{section.title}{section.anonymous ? " · anonim" : ""}</h2>
        {section.notSplit
          ? <p className={styles.note}>Bagian anonim tidak dipilah per departemen. Pilih &quot;Semua departemen&quot; untuk melihat rangkumannya.</p>
          : items.map(item => <article key={item.key} className={base.card} aria-labelledby={`hasil-${section.key}-${item.key}`}>
            <h3 id={`hasil-${section.key}-${item.key}`} className={styles.question}>{item.prompt}</h3>
            {item.body.type !== "none" && <p className={base.meta}>{item.answered} {section.anonymous ? "jawaban" : "orang menjawab"}{item.several && item.body.type === "bars" ? " · boleh pilih lebih dari satu" : ""}</p>}
            <Body item={item} anonymous={section.anonymous} />
          </article>)}
      </section>;
    })}
  </div>;
}
