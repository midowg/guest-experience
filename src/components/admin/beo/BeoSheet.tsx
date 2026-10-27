import type { BeoDocument } from "@/lib/beo-document";
import styles from "@/components/admin/beo/beo-print.module.css";

/**
 * The BEO on A4: the preparation sheet, then the hosting brief on a page of its own. The print
 * page and the live preview on the BEO page both draw this, so they show the same thing.
 */
export function BeoSheets({ doc }: { doc: BeoDocument }) {
  const pages = doc.brief ? 2 : 1;
  const foot = (page: number) => <footer className={styles.foot}>
    <span>{doc.banner || doc.title} · dibuat {doc.generated}</span>{pages > 1 && <span>Halaman {page} dari {pages}</span>}
  </footer>;
  return <>
    <article className={styles.sheet} data-version={doc.version} data-band={doc.banner ? undefined : "none"}>
      {doc.banner && <p className={styles.band}>{doc.banner}</p>}
      <header className={styles.head}>
        <p className={styles.kicker}>Banquet Event Order</p>
        <h1>{doc.title}</h1>
        <p>{doc.when}</p>
        <p className={styles.muted}>{doc.place}</p>
        <p className={styles.muted}>Status: {doc.status}</p>
      </header>
      <div className={styles.numbers}>
        {doc.numbers.map(item => <div key={item.label} className={item.main ? styles.main : undefined}>
          <span>{item.label}</span><strong>{item.value}</strong>{item.note && <small>{item.note}</small>}
        </div>)}
      </div>
      {doc.notes && <section><h2>Catatan</h2><p className={styles.notes}>{doc.notes}</p></section>}
      {doc.tables.map(table => <section key={table.title}>
        <h2>{table.title}</h2>
        {table.note && <p className={styles.muted}>{table.note}</p>}
        {table.rows.length === 0 ? <p className={styles.muted}>{table.empty}</p> : <table>
          <thead><tr>{table.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
        </table>}
      </section>)}
      {foot(1)}
    </article>
    {doc.brief && <article className={styles.sheet} data-version={doc.version} data-band="none">
      <header className={styles.head}>
        <p className={styles.kicker}>Brief tamu</p>
        <h1>{doc.title}</h1>
        <p>{doc.when}</p>
      </header>
      {doc.brief.map(group => <section key={group.title}>
        <h2>{group.title}</h2>
        <table className={styles.pairs}><tbody>{group.rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody></table>
      </section>)}
      {foot(2)}
    </article>}
  </>;
}
