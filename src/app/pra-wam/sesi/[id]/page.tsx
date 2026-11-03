import { notFound } from "next/navigation";
import { DocumentList } from "@/components/pra-wam/DocumentList";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { ButtonLink, Notice } from "@/components/ui";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import { sessionKindLabels, sessionStatusLabels, sessionWhen, sessionWhere } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { myCheckIn } from "@/lib/server/pra-wam/attendance";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { getSession } from "@/lib/server/pra-wam/sessions";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sesi · Pra WAM", robots: { index: false } };

/** One session: when, where, what, who (for panitia and BOD), and its documents. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMemberPage(praWamPath.session(id));
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession(id, member).catch((error: unknown) => { if (error instanceof ServiceError && error.status === 404) return null; throw error; });
  if (!session) notFound();
  const [{ documents, storage }, checkedInAt] = await Promise.all([listDocuments(member, session.id), session.isParticipant ? myCheckIn(session.id, member) : Promise.resolve(null)]);
  const manage = managesSessions(member);
  return <PraWamShell member={member} current="agenda">
    <div className={styles.head}>
      <div><p className={styles.kicker}>{sessionKindLabels[session.kind]}{session.status !== "terbit" ? ` · ${sessionStatusLabels[session.status]}` : ""}</p><h1>{session.title}</h1></div>
      <div className={styles.actions}>
        {seesAllSessions(member) && <ButtonLink variant="secondary" href={praWamPath.sessionAttendance(session.id)}>QR dan daftar hadir</ButtonLink>}
        {manage && <ButtonLink variant="secondary" href={praWamPath.editSession(session.id)}>Ubah sesi</ButtonLink>}
      </div>
    </div>
    {session.status === "batal" && <Notice tone="warning">Sesi ini dibatalkan.</Notice>}
    <section className={styles.card} aria-labelledby="rincian">
      <h2 id="rincian">Rincian</h2>
      <dl className={styles.profile}>
        <dt>Waktu</dt><dd>{sessionWhen(session)}</dd>
        <dt>Tempat</dt><dd>{sessionWhere(session)}</dd>
        <dt>Peserta</dt><dd>{session.participantCount} orang{session.isParticipant ? ", termasuk kamu" : ""}</dd>
        {session.isParticipant && session.status === "terbit" && <><dt>Absen</dt><dd>{checkedInAt ? `Tercatat ${clockLabel(wibTime(checkedInAt))} WIB` : <>Belum. Pindai QR di ruang sesi, atau <a href={praWamPath.scan}>buka pemindai</a>.</>}</dd></>}
      </dl>
      {session.description && <p style={{ whiteSpace: "pre-line" }}>{session.description}</p>}
      {session.participants && session.participants.length > 0 && <details><summary>Daftar peserta</summary><p className={styles.meta}>{session.participants.map(person => person.name).join(", ")}</p></details>}
    </section>
    <section className={styles.card} aria-labelledby="dokumen">
      <h2 id="dokumen">Dokumen sesi</h2>
      <DocumentList documents={documents} sessionId={session.id} storage={storage} canUpload={manage || (session.isParticipant && session.status === "terbit")} />
    </section>
  </PraWamShell>;
}
