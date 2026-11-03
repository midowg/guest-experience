import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, ClipboardList, MapPin, Pencil, QrCode, Users } from "lucide-react";
import { DocumentList } from "@/components/pra-wam/DocumentList";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { RequestChange } from "@/components/pra-wam/ScheduleRequests";
import { Notice } from "@/components/ui";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { sessionKindLabels, sessionStatusLabels, sessionWhen, sessionWhere } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { myCheckIn } from "@/lib/server/pra-wam/attendance";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { myRequests } from "@/lib/server/pra-wam/requests";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { getSession } from "@/lib/server/pra-wam/sessions";
import styles from "@/components/pra-wam/pra-wam.module.css";
import rows from "@/components/pra-wam/peserta.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sesi · WAM", robots: { index: false } };

/** Detail sesi (Penpot "P3"): when, where, who, the material, and what the person can do next. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMemberPage(praWamPath.session(id));
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession(id, member).catch((error: unknown) => { if (error instanceof ServiceError && error.status === 404) return null; throw error; });
  if (!session) notFound();
  const [{ documents, storage }, checkedInAt, requests, rooms] = await Promise.all([
    listDocuments(member, session.id),
    session.isParticipant ? myCheckIn(session.id, member) : Promise.resolve(null),
    session.isParticipant ? myRequests(session.id, member) : Promise.resolve([]),
    listRooms(),
  ]);
  const live = session.status === "terbit";
  const canAsk = session.isParticipant && live && !!session.startsAt && !!session.endsAt && new Date(session.endsAt) > new Date();
  const manage = managesSessions(member);
  const staff = seesAllSessions(member);
  const scan = session.isParticipant && live && !checkedInAt;
  return <PraWamShell member={member} current="agenda" back={{ href: praWamPath.agenda, title: "Detail sesi" }}>
    
    <div className={styles.head} style={{ marginBottom: 12 }}><div><h1>{session.title}</h1></div></div>
    <div className={styles.pills} style={{ marginBottom: 16 }}>
      <span className={`${styles.pill} ${styles.pillLine}`}>{sessionKindLabels[session.kind]}</span>
      {!live && <span className={`${styles.pill} ${styles.pillBrass}`}>{sessionStatusLabels[session.status]}</span>}
      {session.isParticipant && live && (checkedInAt
        ? <span className={`${styles.pill} ${styles.pillSuccess}`}><CheckCircle2 aria-hidden />Hadir · {clockLabel(wibTime(checkedInAt))}</span>
        : <span className={`${styles.pill} ${styles.pillSuccess}`}><CheckCircle2 aria-hidden />Terdaftar · belum absen</span>)}
    </div>
    {session.status === "batal" && <div style={{ marginBottom: 16 }}><Notice tone="warning">Sesi ini dibatalkan.</Notice></div>}

    <section className={styles.card} aria-label="Rincian">
      <dl className={styles.infoList}>
        <div className={styles.row}><span className={styles.tile}><CalendarDays aria-hidden /></span><div><dt>Waktu</dt><dd>{sessionWhen(session)}</dd></div></div>
        <div className={styles.row}><span className={styles.tile}><MapPin aria-hidden /></span><div><dt>Ruang</dt><dd>{sessionWhere(session)}</dd></div></div>
        <div className={styles.row}><span className={styles.tile}><Users aria-hidden /></span><div><dt>Peserta</dt><dd>{session.participantCount} orang{session.isParticipant ? ", termasuk kamu" : ""}</dd></div></div>
      </dl>
      {session.description && <p style={{ whiteSpace: "pre-line", margin: "16px 0 0" }}>{session.description}</p>}
      {session.participants && session.participants.length > 0 && <details style={{ marginTop: 12 }}><summary className={styles.meta}>Daftar peserta</summary><p className={styles.meta}>{session.participants.map(person => person.name).join(", ")}</p></details>}
    </section>

    <p className={styles.sectionLabel}>Materi</p>
    <DocumentList documents={documents} sessionId={session.id} storage={storage} viewerName={member.name} uploadLabel="Unggah materi" canUpload={manage || (session.isParticipant && live)} />

    {(canAsk || requests.length > 0) && session.startsAt && session.endsAt && <>
      <p className={styles.sectionLabel}>Ganti jadwal</p>
      <RequestChange sessionId={session.id} startsAt={session.startsAt} endsAt={session.endsAt} rooms={rooms} requests={requests} canAsk={canAsk} />
    </>}

    {(scan || staff || manage) && <div className={rows.bottomActions}>
      {scan && <a className="button button--primary" href={praWamPath.scan}><QrCode size={18} aria-hidden /> Scan QR absen</a>}
      {staff && <a className="button button--secondary" href={praWamPath.sessionAttendance(session.id)}><ClipboardList size={18} aria-hidden /> QR dan daftar hadir</a>}
      {manage && <a className="button button--secondary" href={praWamPath.editSession(session.id)}><Pencil size={18} aria-hidden /> Ubah sesi</a>}
    </div>}
  </PraWamShell>;
}
