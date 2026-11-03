import { AlertTriangle } from "lucide-react";
import type { BodSummary as Summary } from "@/lib/server/pra-wam/dashboard";
import base from "./pra-wam.module.css";
import styles from "./bod.module.css";

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/**
 * Ringkasan Pra WAM for BOD (Penpot "E3"): read only. Four numbers, attendance per forum as bars
 * (brass for the forum running now), and attendance per department with its lead.
 */
export function BodSummary({ data }: { data: Summary }) {
  const notSignedIn = data.accounts - data.signedIn;
  return <>
    <div className={base.stats}>
      <div className={base.stat}><strong>{data.people}</strong><span>Peserta terdaftar</span>
        <small className={styles.sub}>{data.departments} departemen{data.businessUnits ? ` · ${data.businessUnits} BU` : ""}</small></div>
      <div className={base.stat}><strong>{data.expected ? `${percent(data.present, data.expected)}%` : "—"}</strong><span>Hadir di sesi aktif</span>
        <small className={styles.sub}>{data.expected ? `${data.present} dari ${data.expected} kehadiran` : "Belum ada sesi berjalan"}</small></div>
      <div className={base.stat}><strong>{data.signedIn} / {data.accounts}</strong><span>Akun aktif</span>
        <small className={styles.sub}>{notSignedIn > 0 ? `${notSignedIn} belum masuk` : "Semua sudah masuk"}</small></div>
      <div className={base.stat}><strong>{data.published}</strong><span>Sesi terbit</span>
        <small className={styles.sub}>{data.drafts} draf menunggu jam</small></div>
    </div>

    <div className={styles.grid}>
      <section className={base.card} aria-labelledby="per-forum">
        <div className={styles.head}><h2 id="per-forum">Kehadiran per forum</h2><span className={base.meta}>dari peserta tiap forum</span></div>
        {data.forums.length === 0 ? <p className={base.meta}>Belum ada forum yang berjalan. Angka muncul setelah forum pertama dimulai.</p> : <ul className={styles.bars}>
          {data.forums.map(forum => <li key={forum.id}>
            <span className={styles.barName}>{forum.title}</span>
            <span className={styles.track} aria-hidden><span className={`${styles.fill} ${forum.live ? styles.fillLive : ""}`} style={{ width: `${percent(forum.present, forum.expected)}%` }} /></span>
            <strong className={styles.barValue}>{forum.present} / {forum.expected}</strong>
          </li>)}
        </ul>}
        {data.forums.some(forum => forum.live) && <p className={base.hint}>Bilah kuningan: forum yang sedang berlangsung.</p>}
      </section>

      <section className={base.card} aria-labelledby="per-departemen">
        <h2 id="per-departemen">Per departemen · sesi berjalan</h2>
        {data.units.length === 0 ? <p className={base.meta}>Belum ada data per departemen.</p> : <div className={base.tableWrap}>
          <table className={base.table}>
            <thead><tr><th>Departemen</th><th>Hadir</th><th>Lead</th></tr></thead>
            <tbody>{data.units.map(unit => {
              const low = unit.expected > 0 && unit.present / unit.expected < 0.5;
              return <tr key={unit.id}>
                <td><strong>{unit.name}</strong></td>
                <td><span className={`${styles.count} ${low ? styles.countWarn : ""}`}>{low && <AlertTriangle aria-hidden />}{unit.expected ? `${unit.present} / ${unit.expected}` : "—"}</span></td>
                <td className={unit.leads.length ? undefined : base.meta}>{unit.leads.length ? unit.leads.join(", ") : "Belum ditentukan"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </section>
    </div>
  </>;
}
