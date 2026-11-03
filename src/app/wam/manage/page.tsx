import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, ChevronRight, Plus, QrCode } from "lucide-react";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { SessionStatusPill } from "@/components/pra-wam/SessionStatusPill";
import { Notice } from "@/components/ui";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { sessionWhen, sessionWhere } from "@/lib/pra-wam/sessions";
import { praWamApi, praWamPath } from "@/lib/routes";
import { overview } from "@/lib/server/pra-wam/dashboard";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/panitia.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ringkasan operasional · WAM", robots: { index: false } };

const longDate = (now: Date) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(now);

/** Ringkasan operasional (Penpot "D1"): what is ready, what is running, and what still waits. */
export default async function DashboardPage() {
  const member = await requireMemberPage(praWamPath.dashboard);
  if (!seesAllSessions(member)) notFound();
  const manage = managesSessions(member);
  const now = new Date();
  const today = wibDate(now.toISOString());
  const data = await overview(member, now);
  return <PraWamShell member={member} current="dashboard">
    <ScreenHead eyebrow={`WAM · ${longDate(now)}`} title="Ringkasan operasional" lead={manage ? "Pantau kesiapan dan selesaikan tindakan tertunda." : "Baca saja: kesiapan sesi dan kehadiran."}
      actions={manage ? <a className="button button--primary" href={praWamPath.newSession}><Plus size={18} aria-hidden /> Buat sesi</a> : undefined} />
    {!data.migrated && <Notice tone="warning">Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>}

    <div className={base.stats}>
      <div className={base.stat}><strong>{data.people}</strong><span>Karyawan aktif</span></div>
      <div className={base.stat}><strong>{data.todayExpected ? `${data.todayPresent} / ${data.todayExpected}` : "—"}</strong><span>Hadir di sesi hari ini</span></div>
      <a className={`${base.stat} ${data.openRequests ? base.statBrass : ""}`} href={manage ? praWamPath.requests : undefined} style={{ textDecoration: "none", color: "inherit" }}>
        <strong>{data.openRequests}</strong><span>Permintaan jadwal</span>
      </a>
      <div className={base.stat}><strong>{data.published} <small style={{ fontSize: 15 }}>terbit</small></strong><span>{data.drafts} draf menunggu jam</span></div>
    </div>

    <section className={base.card} aria-labelledby="kesiapan">
      <div className={styles.cardHead}><h2 id="kesiapan">Jadwal &amp; kesiapan sesi</h2><a href={praWamPath.sessions} className={base.meta}>Semua sesi</a></div>
      {data.upcoming.length === 0 ? <p className={base.meta}>Belum ada sesi terbit mulai hari ini.</p> : <div className={base.tableWrap}>
        <table className={base.table}>
          <thead><tr><th>Waktu</th><th>Sesi / lokasi</th><th>Peserta</th><th>Status</th>{manage && <th>Tindakan</th>}</tr></thead>
          <tbody>{data.upcoming.map(session => <tr key={session.id}>
            <td><strong>{session.startsAt ? clockLabel(wibTime(session.startsAt)) : "—"}</strong>{session.startsAt && wibDate(session.startsAt) !== today && <small>{dayLabel(wibDate(session.startsAt))}</small>}</td>
            <td><a href={praWamPath.session(session.id)} style={{ color: "inherit", fontWeight: 700, textDecoration: "none" }}>{session.title}</a><small>{sessionWhere(session)}</small></td>
            <td>{session.startsAt && new Date(session.startsAt).getTime() - 30 * 60_000 <= now.getTime() ? `${session.present} / ${session.participantCount}` : `${session.participantCount} peserta`}</td>
            <td><SessionStatusPill session={session} now={now} /></td>
            {manage && <td><div className={styles.actionsCell}>
              {session.endsAt && new Date(session.endsAt) <= now
                ? <a className="button button--secondary" href={praWamPath.sessionAttendance(session.id)}>Lihat absensi</a>
                : <a className="button button--primary" href={praWamApi.sessionQr(session.id)} target="_blank" rel="noopener"><QrCode size={16} aria-hidden /> Cetak QR</a>}
              <a className="button button--secondary" href={praWamPath.editSession(session.id)}>Ubah</a>
            </div></td>}
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <div className={styles.twoCol}>
      <section className={base.card} aria-labelledby="berikutnya">
        <h2 id="berikutnya">Forum yang menunggu jam</h2>
        {data.waiting.length === 0 ? <p className={base.meta}>Semua forum sudah punya jadwal.</p> : data.waiting.map(session =>
          <a key={session.id} className={styles.rowLink} href={manage ? praWamPath.editSession(session.id) : praWamPath.session(session.id)}>
            <span className={base.tile}><CalendarDays aria-hidden /></span>
            <span><strong>{session.title}</strong><small>{sessionWhen(session)}</small></span>
            <ChevronRight size={18} aria-hidden />
          </a>)}
      </section>
      {manage && data.openRequests > 0 && <a className={styles.alert} href={praWamPath.requests} style={{ textDecoration: "none" }}>
        <AlertTriangle aria-hidden />
        <span><small>Perlu tindakan</small>{data.openRequests} permintaan jadwal menunggu jawaban</span>
      </a>}
    </div>
  </PraWamShell>;
}
