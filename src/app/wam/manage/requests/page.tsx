import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { RequestReview } from "@/components/pra-wam/ScheduleRequests";
import { Notice } from "@/components/ui";
import { requestStatusLabels, spanLabel } from "@/lib/pra-wam/requests";
import { managesSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { allRequests } from "@/lib/server/pra-wam/requests";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/pra-wam/panitia.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Permintaan jadwal · WAM", robots: { index: false } };

/** Panitia (Penpot "K2 · Tinjau permintaan"): requests waiting for an answer, and the latest answered. */
export default async function RequestsPage() {
  const member = await requireMemberPage(praWamPath.requests);
  if (!managesSessions(member)) notFound();
  const { open, done, migrated } = await allRequests(member);
  return <PraWamShell member={member} current="permintaan">
    <ScreenHead eyebrow="Kelola acara" title={`Permintaan jadwal${open.length ? ` · ${open.length} diajukan` : ""}`}
      lead="Menyetujui memindahkan sesi (bila ruangnya kosong) dan memberi tahu semua peserta. Menolak memberi tahu pengaju beserta catatanmu." />
    {!migrated ? <Notice tone="warning">Ganti jadwal menunggu migrasi 202611040007_pra_wam_schedule_requests.sql.</Notice> : <div className={styles.twoCol} style={{ marginTop: 0 }}>
      <section aria-label="Menunggu jawaban"><RequestReview requests={open} /></section>
      <section className={base.card} aria-labelledby="riwayat">
        <h2 id="riwayat">Riwayat</h2>
        {done.length === 0 ? <p className={base.meta}>Belum ada permintaan yang dijawab.</p> : done.map(request =>
          <a key={request.id} className={styles.rowLink} href={praWamPath.session(request.sessionId)}>
            <span className={base.tile}>{request.status === "disetujui" ? <CheckCircle2 aria-hidden /> : <XCircle aria-hidden />}</span>
            <span><strong>{request.sessionTitle}</strong><small>{requestStatusLabels[request.status]} · {request.requester} · usul {spanLabel(request.toStartsAt, request.toEndsAt)}{request.reviewNote ? ` · ${request.reviewNote}` : ""}</small></span>
          </a>)}
      </section>
    </div>}
  </PraWamShell>;
}
