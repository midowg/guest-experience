import { notFound } from "next/navigation";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { RequestReview } from "@/components/pra-wam/ScheduleRequests";
import { Notice } from "@/components/ui";
import { requestStatusLabels, spanLabel } from "@/lib/pra-wam/requests";
import { managesSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { allRequests } from "@/lib/server/pra-wam/requests";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Permintaan jadwal · Pra WAM", robots: { index: false } };

/** Panitia: schedule change requests waiting for an answer, and the latest answered. */
export default async function RequestsPage() {
  const member = await requireMemberPage(praWamPath.requests);
  if (!managesSessions(member)) notFound();
  const { open, done, migrated } = await allRequests(member);
  return <PraWamShell member={member} current="permintaan">
    <div className={styles.head}><div><p className={styles.kicker}>Panitia</p><h1>Permintaan jadwal</h1>
      <p>Menyetujui memindahkan sesi (bila ruangnya kosong) dan memberi tahu semua peserta. Menolak memberi tahu pengaju beserta catatanmu.</p></div></div>
    {!migrated ? <Notice tone="warning">Ganti jadwal menunggu migrasi 202611040007_pra_wam_schedule_requests.sql.</Notice> : <>
      <section className={styles.card} aria-labelledby="menunggu"><h2 id="menunggu">Menunggu ({open.length})</h2><RequestReview requests={open} /></section>
      {done.length > 0 && <section className={styles.card} aria-labelledby="riwayat"><h2 id="riwayat">Riwayat</h2>
        <div className={styles.mine}>{done.map(request => <article key={request.id} className={styles.mineItem}>
          <span className={styles.kicker}>{requestStatusLabels[request.status]}</span>
          <h3>{request.sessionTitle}</h3>
          <span className={styles.meta}>{request.requester} · usul {spanLabel(request.toStartsAt, request.toEndsAt)}{request.reviewNote ? ` · ${request.reviewNote}` : ""}</span>
        </article>)}</div>
      </section>}
    </>}
  </PraWamShell>;
}
