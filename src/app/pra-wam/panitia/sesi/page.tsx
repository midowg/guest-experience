import { notFound } from "next/navigation";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { ButtonLink, Notice } from "@/components/ui";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { sessionKindLabels, sessionWhen, sessionWhere, type Session, type SessionStatus } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Semua sesi · Pra WAM", robots: { index: false } };

const groups: { status: SessionStatus; title: string; empty: string }[] = [
  { status: "draf", title: "Draf", empty: "Tidak ada draf." },
  { status: "terbit", title: "Terbit", empty: "Belum ada sesi yang diterbitkan." },
  { status: "batal", title: "Dibatalkan", empty: "" },
];

/** Every session, drafts first: panitia changes them, BOD reads. */
export default async function SessionsPage() {
  const member = await requireMemberPage(praWamPath.sessions);
  if (!seesAllSessions(member)) notFound();
  const { sessions, migrated } = await listSessions(member);
  const manage = managesSessions(member);
  const row = (session: Session) => <article key={session.id} className={styles.mineItem}>
    <h3>{manage ? <a href={praWamPath.editSession(session.id)}>{session.title}</a> : <a href={praWamPath.session(session.id)}>{session.title}</a>}</h3>
    <span className={styles.meta}>{sessionKindLabels[session.kind]} · {sessionWhen(session)} · {sessionWhere(session)}</span>
    <span className={styles.meta}>{session.participantCount} peserta{session.status === "terbit" ? <> · <a href={praWamPath.sessionAttendance(session.id)}>QR dan daftar hadir</a></> : null}</span>
  </article>;
  return <PraWamShell member={member} current="sesi">
    <div className={styles.head}>
      <div><p className={styles.kicker}>{manage ? "Panitia" : "Baca saja"}</p><h1>Semua sesi</h1>
        <p>Forum dari kalender Pra WAM masuk sebagai draf. Isi jam, ruang, dan peserta, lalu terbitkan supaya muncul di agenda peserta.</p></div>
      {manage && migrated && <ButtonLink href={praWamPath.newSession}>Buat sesi</ButtonLink>}
    </div>
    {!migrated && <Notice tone="warning">Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>}
    {migrated && groups.map(group => {
      const items = sessions.filter(session => session.status === group.status);
      if (!items.length && !group.empty) return null;
      return <section key={group.status} className={styles.card} aria-labelledby={`grup-${group.status}`}>
        <h2 id={`grup-${group.status}`}>{group.title} <span className={styles.meta}>({items.length})</span></h2>
        {items.length ? <div className={styles.mine}>{items.map(row)}</div> : <p className={styles.meta}>{group.empty}</p>}
      </section>;
    })}
  </PraWamShell>;
}
