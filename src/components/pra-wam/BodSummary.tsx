import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeftRight, BarChart3, Bot, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, ListChecks, UserX, Users } from "lucide-react";
import { lowAttendance, percent, type AttentionKind } from "@/lib/pra-wam/bod";
import { praWamPath } from "@/lib/routes";
import type { BodSummary as Summary } from "@/lib/server/pra-wam/dashboard";
import base from "./pra-wam.module.css";
import styles from "./bod.module.css";

const ATTENDANCE_MIGRATION = "202611040005_pra_wam_attendance.sql";
const DEPARTMENTS_SHOWN = 5;

/** Each kind of "Perlu perhatian" item: its icon, and where one tap leads (none when BOD cannot open it). */
const attention: Record<AttentionKind, { icon: ReactNode; href?: string }> = {
  "low-attendance": { icon: <AlertTriangle aria-hidden />, href: praWamPath.people },
  requests: { icon: <ArrowLeftRight aria-hidden />, href: praWamPath.panitiaView },
  drafts: { icon: <CalendarClock aria-hidden />, href: praWamPath.sessions },
  "not-signed-in": { icon: <UserX aria-hidden />, href: praWamPath.people },
  deadline: { icon: <CalendarDays aria-hidden /> },
};

/**
 * Ringkasan Pra WAM for BOD, read only. Phone (Penpot "B1"): greeting, three numbers, Perlu
 * perhatian, Akses cepat, attendance per forum. Desktop (Penpot "E3"): four numbers, then the
 * forums, Perlu perhatian and Akses cepat on the left, departments and the survey on the right.
 * Surveys and MCP do not exist yet: they say so instead of showing numbers.
 */
export function BodSummary({ data, greeting, date }: { data: Summary; greeting: string; date: string }) {
  const notSignedIn = data.accounts - data.signedIn;
  const active = data.active;
  const attendanceShown = data.attendanceReady && !!active;
  return <div className={styles.page}>
    <header className={styles.intro}>
      <div>
        <h1>Ringkasan Pra WAM</h1>
        <p className={styles.greet}>{greeting}</p>
        <p className={styles.lead}>{date} · data langsung · akses baca saja</p>
      </div>
      <div className={styles.scope} aria-label="Cakupan data">
        <span className={styles.scopePill}>Semua departemen</span>
        <span className={styles.scopePill}>Semua BU</span>
      </div>
    </header>

    <div className={styles.kpis}>
      <div className={`${styles.kpi} ${styles.wideOnly}`}>
        <strong>{data.people}</strong><span>Peserta terdaftar</span>
        <small>{data.departments} departemen{data.businessUnits ? ` · ${data.businessUnits} BU` : ""}</small>
      </div>
      <div className={styles.kpi}>
        <strong>{attendanceShown ? `${percent(active.present, active.expected)}%` : "—"}</strong><span>Hadir di sesi aktif</span>
        <small>{!active ? "Belum ada forum berjalan" : !data.attendanceReady ? "Absen belum aktif" : `${active.present} dari ${active.expected} · ${active.title}`}</small>
      </div>
      <div className={styles.kpi}>
        <strong>{data.signedIn} / {data.accounts}</strong><span>Akun aktif</span>
        <small>{data.accounts === 0 ? "Akun belum dibuat" : notSignedIn > 0 ? `${notSignedIn} belum masuk` : "Semua sudah masuk"}</small>
      </div>
      <div className={styles.kpi}>
        <strong>—</strong><span>Respons survei</span>
        <small>Belum ada survei</small>
      </div>
    </div>

    <div className={styles.columns}>
      <div className={styles.left}>
        <section className={styles.attention} aria-labelledby="perhatian">
          <h2 id="perhatian">Perlu perhatian BOD</h2>
          {data.attention.length === 0
            ? <p className={styles.allClear}><CheckCircle2 aria-hidden />Tidak ada yang perlu perhatian saat ini.</p>
            : <ul>{data.attention.map(item => {
              const { icon, href } = attention[item.kind];
              const body = <>{icon}<span><strong>{item.title}</strong><small>{item.detail}</small></span>{href && <ChevronRight className={styles.chevron} aria-hidden />}</>;
              // A date means nothing without the day itself, so the deadline keeps its line on the phone too.
              const row = `${styles.attentionRow} ${item.kind === "deadline" ? styles.keepDetail : ""}`;
              return <li key={item.kind}>{href ? <a className={row} href={href}>{body}</a> : <div className={row}>{body}</div>}</li>;
            })}</ul>}
        </section>

        <nav className={styles.quick} aria-label="Akses cepat">
          <a className={styles.quickItem} href={praWamPath.people}><Users aria-hidden />Semua unit &amp; BU</a>
          <a className={styles.quickItem} href={praWamPath.panitiaView}><BarChart3 aria-hidden />Dashboard panitia (baca)</a>
          <a className={styles.quickItem} href={praWamPath.surveyResults}><ListChecks aria-hidden />Hasil survei</a>
          <div className={`${styles.quickItem} ${styles.quickSoon}`} aria-disabled="true"><Bot aria-hidden /><span>Tanya data (MCP)<small>Belum tersedia</small></span></div>
        </nav>

        <section className={`${base.card} ${styles.forums}`} aria-labelledby="per-forum">
          <div className={styles.cardHead}><h2 id="per-forum">Kehadiran per forum</h2>{data.people > 0 && <span>dari {data.people} peserta</span>}</div>
          <ForumBars data={data} />
        </section>
      </div>

      <div className={styles.right}>
        <section className={base.card} aria-labelledby="per-departemen">
          <div className={styles.cardHead}><h2 id="per-departemen">Per departemen · forum berjalan</h2></div>
          <Departments data={data} />
        </section>

        <section className={base.card} aria-labelledby="survei">
          <div className={styles.cardHead}><h2 id="survei">Survei</h2><a href={praWamPath.surveyResults}>Lihat hasil</a></div>
          <p className={styles.empty}>Belum ada survei. Hasilnya muncul di sini setelah panitia menerbitkan survei pertama.</p>
        </section>
      </div>
    </div>
  </div>;
}

/** Attendance per started forum as meters, labelled with the count; brass (and the word) for the one running now. */
function ForumBars({ data }: { data: Summary }) {
  if (!data.migrated) return <p className={styles.empty}>Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</p>;
  if (data.forums.length === 0) return <p className={styles.empty}>Belum ada forum yang dimulai. Angka muncul setelah forum pertama berjalan.</p>;
  if (!data.attendanceReady) return <>
    <p className={styles.empty}>Absen belum aktif (menunggu migrasi {ATTENDANCE_MIGRATION}), jadi kehadiran belum bisa dihitung.</p>
    <ul className={styles.plainList}>{data.forums.map(forum => <li key={forum.id}><a href={praWamPath.session(forum.id)}>{forum.title}</a><span>{forum.expected} peserta</span></li>)}</ul>
  </>;
  const partial = data.forums.filter(forum => forum.expected !== data.people);
  return <>
    <ul className={styles.bars}>
      {data.forums.map(forum => {
        const value = forum.expected === data.people ? `${forum.present}` : `${forum.present}/${forum.expected}`;
        return <li key={forum.id}>
          <a className={styles.bar} href={praWamPath.session(forum.id)} title={`${forum.title}: ${forum.present} dari ${forum.expected} hadir (${percent(forum.present, forum.expected)}%)`}>
            <span className={styles.barName}>{forum.title}{forum.live && <small>Berlangsung</small>}</span>
            <span className={styles.track} aria-hidden><span className={`${styles.fill} ${forum.live ? styles.fillLive : ""}`} style={{ width: `${percent(forum.present, forum.expected)}%` }} /></span>
            <strong className={styles.barValue}>{value}</strong>
          </a>
        </li>;
      })}
    </ul>
    {(partial.length > 0 || data.forums.some(forum => forum.live)) && <p className={styles.note}>
      {partial.map(forum => `${forum.title} hanya untuk ${forum.expected} peserta.`).join(" ")}
      {data.forums.some(forum => forum.live) ? `${partial.length ? " " : ""}Bilah kuningan: forum yang sedang berlangsung.` : ""}
    </p>}
  </>;
}

/** Attendance per department with its lead; the first five, the rest on the Peserta page. */
function Departments({ data }: { data: Summary }) {
  if (data.units.length === 0) return <p className={styles.empty}>Belum ada data departemen. Unit dan jabatan diimpor super admin di halaman Data karyawan.</p>;
  const shown = data.units.slice(0, DEPARTMENTS_SHOWN);
  return <>
    <table className={styles.table}>
      <thead><tr><th scope="col">Departemen</th><th scope="col">Hadir</th><th scope="col">Lead</th></tr></thead>
      <tbody>{shown.map(unit => {
        const low = data.attendanceReady && lowAttendance(unit);
        return <tr key={unit.id}>
          <th scope="row">{unit.name}</th>
          <td><span className={`${styles.count} ${low ? styles.countWarn : ""}`}>{low && <AlertTriangle aria-label="Di bawah 50%" />}{data.attendanceReady && unit.expected ? `${unit.present} / ${unit.expected}` : "—"}</span></td>
          <td className={unit.leads.length ? undefined : styles.muted}>{unit.leads.length ? unit.leads.join(", ") : "Belum ditentukan"}</td>
        </tr>;
      })}</tbody>
    </table>
    <p className={styles.tableFoot}>
      <span>Menampilkan {shown.length} dari {data.units.length} departemen</span>
      {data.units.length > shown.length && <a href={praWamPath.people}>Lihat semua</a>}
    </p>
  </>;
}
