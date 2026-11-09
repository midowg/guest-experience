import { DocumentList } from "@/components/pra-wam/DocumentList";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { praWamPath } from "@/lib/routes";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dokumen · WAM", robots: { index: false } };

/**
 * Dokumen (Penpot "P8"): everyone's documents and those of the person's sessions, grouped. Only to
 * read: panitia upload in Kelola acara → Dokumen (9 Nov 2026).
 */
export default async function DocumentsPage() {
  const member = await requireMemberPage(praWamPath.documents);
  const { documents, migrated, storage } = await listDocuments(member);
  return <>
    <ScreenHead title="Dokumen" lead="Untuk mengunggah bahan sesi, buka sesi itu dari Agenda." />
    {!migrated ? <Notice tone="warning">Dokumen menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>
      : <DocumentList documents={documents} grouped viewerName={member.name} canUpload={false} storage={storage} />}
  </>;
}
