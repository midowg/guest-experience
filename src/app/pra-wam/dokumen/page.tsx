import { DocumentList } from "@/components/pra-wam/DocumentList";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { managesSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dokumen · Pra WAM", robots: { index: false } };

/** Every document the person may read; panitia also uploads here, for everyone or for one session. */
export default async function DocumentsPage() {
  const member = await requireMemberPage(praWamPath.documents);
  const manage = managesSessions(member);
  const [{ documents, migrated, storage }, { sessions }] = await Promise.all([listDocuments(member), manage ? listSessions(member) : Promise.resolve({ sessions: [] })]);
  return <PraWamShell member={member} current="dokumen">
    <div className={styles.head}><div><p className={styles.kicker}>Bahan dan materi</p><h1>Dokumen</h1>
      <p>Dokumen untuk semua peserta dan dokumen sesi yang kamu ikuti.{manage ? "" : " Untuk mengunggah bahan sesi, buka sesi itu dari Agenda."}</p></div></div>
    {!migrated ? <Notice tone="warning">Dokumen menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>
      : <section className={styles.card}><DocumentList documents={documents} canUpload={manage} storage={storage} sessions={sessions.filter(session => session.status !== "batal").map(({ id, title }) => ({ id, title }))} /></section>}
  </PraWamShell>;
}
