import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { SessionStatusPill } from "@/components/pra-wam/SessionStatusPill";
import { Notice } from "@/components/ui";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { sessionKindLabels, sessionWhen, sessionWhere, type Session, type SessionStatus } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/panitia.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jadwal sesi · WAM", robots: { index: false } };

const groups: { status: SessionStatus; title: string; empty: string }[] = [
  { status: "draf", title: "Draf", empty: "Tidak ada draf." },
  { status: "terbit", title: "Terbit", empty: "Belum ada sesi yang diterbitkan." },
  { status: "batal", title: "Dibatalkan", empty: "" },
];

/** Jadwal sesi: every session, drafts first, as tables (panitia changes, BOD reads). */
export default async function SessionsPage() {
  const member = await requireMemberPage(praWamPath.sessions);
  if (!seesAllSessions(member)) notFound();
  const { sessions, migrated } = await listSessions(member);
  const manage = managesSessions(member);
  const now = new Date();
  const table = (items: Session[]) => <div className={base.tableWrap}>
    <table className={base.table}>
      <thead><tr><th>Sesi</th><th>Waktu</th><th>Tempat</th><th>Peserta</th><th>Status</th><th>Tindakan</th></tr></thead>
      <tbody>{items.map(session => <tr key={session.id}>
        <td><strong>{session.title}</strong><small>{sessionKindLabels[session.kind]}</small></td>
        <td>{sessionWhen(session)}</td>
        <td>{sessionWhere(session)}</td>
        <td>{session.participantCount}</td>
        <td><SessionStatusPill session={session} now={now} /></td>
        <td><div className={styles.actionsCell}>
          {manage && <a className="button button--secondary" href={praWamPath.editSession(session.id)}>{session.status === "draf" ? "Atur" : "Ubah"}</a>}
          {session.status === "terbit" && <a className="button button--secondary" href={praWamPath.sessionAttendance(session.id)}>QR dan hadir</a>}
          {!manage && <a className="button button--secondary" href={praWamPath.session(session.id)}>Lihat</a>}
        </div></td>
      </tr>)}</tbody>
    </table>
  </div>;
  return <PraWamShell member={member} current="sesi">
    <ScreenHead eyebrow={manage ? "Kelola acara" : "Baca saja"} title="Jadwal sesi"
      lead="Forum dari kalender Pra WAM masuk sebagai draf. Isi jam, ruang, dan peserta, lalu terbitkan supaya muncul di agenda peserta."
      actions={manage && migrated ? <a className="button button--primary" href={praWamPath.newSession}><Plus size={18} aria-hidden /> Buat sesi</a> : undefined} />
    {!migrated && <Notice tone="warning">Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>}
    {migrated && groups.map(group => {
      const items = sessions.filter(session => session.status === group.status);
      if (!items.length && !group.empty) return null;
      return <section key={group.status} className={base.card} aria-labelledby={`grup-${group.status}`}>
        <div className={styles.cardHead}><h2 id={`grup-${group.status}`}>{group.title} <span className={base.meta}>({items.length})</span></h2></div>
        {items.length ? table(items) : <p className={base.meta}>{group.empty}</p>}
      </section>;
    })}
  </PraWamShell>;
}
