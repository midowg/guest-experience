import { DocumentList } from "@/components/pra-wam/DocumentList";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { managesSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { listSessions } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dokumen · WAM", robots: { index: false } };

/** Dokumen (Penpot "P8"): everyone's documents and those of the person's sessions, grouped; panitia uploads here. */
export default async function DocumentsPage() {
  const member = await requireMemberPage(praWamPath.documents);
  const manage = managesSessions(member);
  const [{ documents, migrated, storage }, { sessions }] = await Promise.all([listDocuments(member), manage ? listSessions(member) : Promise.resolve({ sessions: [] })]);
  return <PraWamShell member={member} current="dokumen">
    <ScreenHead title="Dokumen" lead={manage ? undefined : "Untuk mengunggah bahan sesi, buka sesi itu dari Agenda."} />
    {!migrated ? <Notice tone="warning">Dokumen menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>
      : <DocumentList documents={documents} grouped viewerName={member.name} canUpload={manage} storage={storage}
        sessions={sessions.filter(session => session.status !== "batal").map(({ id, title }) => ({ id, title }))} />}
  </PraWamShell>;
}
