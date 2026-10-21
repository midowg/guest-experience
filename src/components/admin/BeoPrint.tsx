"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import { beoVersionInfo, beoVersionParam, type BeoDocument, type BeoVersion } from "@/lib/beo-document";
import styles from "./beo-print.module.css";

/**
 * The BEO as a printable A4 sheet. The toolbar (screen only) switches version, prints, or downloads
 * the same content as PDF; the coloured band says which version is on paper.
 */
export function BeoPrint({ doc, eventId }: { doc: BeoDocument; eventId: string }) {
  const base = `/admin/events/${eventId}/beo`;
  const pdf = `/api/admin/events/${eventId}/beo/pdf?versi=${beoVersionParam[doc.version]}`;
  return <div className={styles.screen}>
    <div className={styles.toolbar}>
      <a href={base} className={styles.back}><ArrowLeft size={16} aria-hidden="true" /> Kembali ke BEO</a>
      <nav className={styles.switch} aria-label="Pilih versi">
        {(["vendor", "internal"] as BeoVersion[]).map(version => <a key={version} href={`${base}/cetak?versi=${beoVersionParam[version]}`} aria-current={doc.version === version ? "page" : undefined} data-version={version}>
          {beoVersionInfo[version].label}
        </a>)}
      </nav>
      <div className={styles.actions}>
        <button type="button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Cetak</button>
        <a href={pdf} download><Download size={16} aria-hidden="true" /> Unduh PDF</a>
      </div>
      <p className={styles.includes}>{beoVersionInfo[doc.version].includes}</p>
    </div>

    <article className={styles.sheet} data-version={doc.version}>
      <p className={styles.band}>{doc.banner}</p>
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
      <footer className={styles.foot}>{doc.banner} · dibuat {doc.generated}</footer>
    </article>
  </div>;
}
